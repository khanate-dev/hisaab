// Event notifications (spec §3.5, #62, #63): raises Recurring due, Auto-recorded, Budget threshold, Loan due and the
// Monthly summary in each household at its 09:00, and the Household activity digest at its 20:00, hourly (pg_cron
// calls this with the service role's key). The logic is in packages/domain behind adapters (ADR-0010); this wires them
// to PostgREST. Push and email follow through `dispatch-notifications`.
import {
	type DigestFacts,
	type HouseholdFacts,
	type RaiseAdapters,
	raiseScheduledNotifications,
	type SummaryFacts,
} from "../../../packages/domain/src/notification-triggers.ts";
import { rpcAs, serviceOnly } from "../_shared/service-only.ts";

const url = Deno.env.get("SUPABASE_URL");
if (!url) throw new Error("SUPABASE_URL must be set");

const adaptersFor = (key: string): RaiseAdapters => {
	const rpc = rpcAs(url, key);
	return {
		facts: async (asOf) =>
			(await rpc("notification_facts", { as_of: asOf })) as HouseholdFacts[],
		digestFacts: async (asOf) =>
			(await rpc("digest_facts", { as_of: asOf })) as DigestFacts[],
		summaryFacts: async (asOf) =>
			(await rpc("summary_facts", { as_of: asOf })) as SummaryFacts[],
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
