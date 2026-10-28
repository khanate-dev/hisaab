// Event notifications (spec §3.5, #62): raises Recurring due, Auto-recorded, Budget threshold and Loan due in each
// household at its 09:00, hourly (pg_cron calls this with the service role's key). The logic is in packages/domain
// behind adapters (ADR-0010); this wires them to PostgREST. Push follows through `dispatch-notifications`.
import {
	type HouseholdFacts,
	type RaiseAdapters,
	raiseScheduledNotifications,
} from "../../../packages/domain/src/notification-triggers.ts";
import { Forbidden, refused, serviceOnly } from "../_shared/service-only.ts";

const url = Deno.env.get("SUPABASE_URL");
if (!url) throw new Error("SUPABASE_URL must be set");

const adaptersFor = (key: string): RaiseAdapters => {
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
		if (refused(response.status)) throw new Forbidden();
		if (!response.ok)
			throw new Error(
				`PostgREST rpc/${name} answered ${response.status}: ${await response.text()}`,
			);
		return response.json();
	};
	return {
		facts: async (asOf) =>
			(await rpc("notification_facts", { as_of: asOf })) as HouseholdFacts[],
		raise: async (notifications) =>
			(await rpc("raise_notifications", {
				raised: notifications.map((n) => ({
					household_id: n.householdId,
					user_id: n.userId,
					trigger: n.trigger,
					payload: n.payload,
					dedupe_key: n.dedupeKey,
				})),
			})) as number,
	};
};

Deno.serve(
	serviceOnly(async (key) =>
		Response.json({
			status: "ok",
			raised: await raiseScheduledNotifications(adaptersFor(key), new Date()),
		}),
	),
);
