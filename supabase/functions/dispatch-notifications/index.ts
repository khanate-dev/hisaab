// Notifications (spec §3.5; issue #13): sends what's due in the push and email outbox, every minute (pg_cron calls this
// with the service role's key). The logic is in packages/domain behind adapters (ADR-0010); this wires them to
// PostgREST. No sender is wired yet: push (8.2) and the Monthly summary's email bring theirs.
import {
	type ClaimedDelivery,
	type DispatchAdapters,
	DispatchForbidden,
	handleDispatchRequest,
} from "../../../packages/domain/src/notifications.ts";

const url = Deno.env.get("SUPABASE_URL");
if (!url) throw new Error("SUPABASE_URL must be set");

type ClaimedRow = {
	id: string;
	notification_id: string;
	user_id: string;
	channel: ClaimedDelivery["channel"];
	target: string;
	attempts: number;
	trigger: ClaimedDelivery["trigger"];
	payload: string;
};

/**
 * The adapters, calling PostgREST with the caller's own key: only the service role may claim and settle deliveries,
 * so anyone else is refused by the database itself.
 */
const adaptersFor = (key: string): DispatchAdapters => {
	const rpc = async (name: string, args: unknown) => {
		const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
			method: "POST",
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(args),
		});
		// 426: the contract version gate, which lets only the service role through without the app's header.
		if (
			response.status === 401 ||
			response.status === 403 ||
			response.status === 426
		)
			throw new DispatchForbidden();
		if (!response.ok)
			throw new Error(
				`PostgREST rpc/${name} answered ${response.status}: ${await response.text()}`,
			);
		const text = await response.text();
		return text === "" ? null : JSON.parse(text);
	};
	return {
		claim: async (limit) =>
			((await rpc("claim_deliveries", { batch: limit })) as ClaimedRow[]).map(
				(row) => ({
					id: row.id,
					notificationId: row.notification_id,
					userId: row.user_id,
					channel: row.channel,
					target: row.target,
					attempts: row.attempts,
					trigger: row.trigger,
					payload: row.payload,
				}),
			),
		settle: async (results) => {
			await rpc("settle_deliveries", { results });
		},
	};
};

Deno.serve((request) => handleDispatchRequest(adaptersFor, {}, request));
