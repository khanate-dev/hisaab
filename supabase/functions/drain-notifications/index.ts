// Notifications (spec §3.5): drains the outbox every minute (pg_cron calls this with the service role's key), fanning
// each Notification out to its recipients' inboxes. The logic is in packages/domain behind adapters (ADR-0010); this
// wires them to PostgREST as the service role.
import {
	type DrainAdapters,
	DrainForbidden,
	handleDrainRequest,
	type MemberRole,
	type NotificationTrigger,
} from "../../../packages/domain/src/notifications.ts";

const env = (name: string) => {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`${name} must be set`);
	return value;
};

const url = env("SUPABASE_URL");

/**
 * The adapters, calling PostgREST with the caller's own key: only the service role may read and write the outbox, so
 * anyone else is refused by the database itself.
 */
const adaptersFor = (key: string): DrainAdapters => {
	const rest = async (path: string, init: RequestInit = {}) => {
		const response = await fetch(`${url}/rest/v1/${path}`, {
			...init,
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				"content-type": "application/json",
				...init.headers,
			},
		});
		if (response.status === 401 || response.status === 403)
			throw new DrainForbidden();
		if (!response.ok)
			throw new Error(
				`PostgREST ${path} answered ${response.status}: ${await response.text()}`,
			);
		const text = await response.text();
		return text === "" ? null : JSON.parse(text);
	};

	type PendingRow = {
		id: string;
		household_id: string;
		trigger: NotificationTrigger;
		subject_user_id: string | null;
		payload: string;
	};

	return {
		pending: async (limit) =>
			(
				(await rest("rpc/pending_notifications", {
					method: "POST",
					body: JSON.stringify({ batch: limit }),
				})) as PendingRow[]
			).map((row) => ({
				id: row.id,
				householdId: row.household_id,
				trigger: row.trigger,
				subjectUserId: row.subject_user_id,
				payload: row.payload,
			})),
		members: async (householdId) =>
			(
				(await rest(
					`memberships?household_id=eq.${householdId}&select=user_id,role`,
				)) as {
					user_id: string;
					role: MemberRole;
				}[]
			).map((m) => ({ userId: m.user_id, role: m.role })),
		preferences: async (householdId) =>
			await rest(
				`notification_preferences?household_id=eq.${householdId}&select=user_id,trigger,enabled,created_at`,
			),
		deliver: async (deliveries, drained) => {
			await rest("rpc/deliver_notifications", {
				method: "POST",
				body: JSON.stringify({
					deliveries: deliveries.map((d) => ({
						notification_id: d.notificationId,
						household_id: d.householdId,
						user_id: d.userId,
						channel: d.channel,
						trigger: d.trigger,
						payload: d.payload,
					})),
					drained,
				}),
			});
		},
	};
};

Deno.serve((request) => handleDrainRequest(adaptersFor, request));
