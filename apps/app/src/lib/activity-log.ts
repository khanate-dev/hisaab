import { supabase } from "./supabase";

/** A row of the Activity log as it's read online (spec §3.2); money in `before`/`after` is decimal text. */
export type ActivityRow = {
	id: string;
	table_name: string;
	row_id: string;
	action: "insert" | "update" | "delete";
	actor_id: string | null;
	device_time: string | null;
	synced_at: string;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
};

/** How many changes a read returns. */
export const ACTIVITY_PAGE = 100;

/** Where a page of the log ends, so the next one starts just older than it: when it synced, then its id. */
export type ActivityCursor = { synced_at: string; id: string };

/** The household's changes, newest first, from the server, older than `before`; the log never syncs to devices. */
export const fetchActivityLog = async (
	householdId: string,
	before: ActivityCursor | null = null,
): Promise<ActivityRow[]> => {
	let query = supabase
		.from("activity_log")
		.select(
			"id, table_name, row_id, action, actor_id, device_time, synced_at, before, after",
		)
		.eq("household_id", householdId);
	if (before)
		query = query.or(
			`synced_at.lt.${before.synced_at},and(synced_at.eq.${before.synced_at},id.lt.${before.id})`,
		);
	const { data, error } = await query
		.order("synced_at", { ascending: false })
		.order("id", { ascending: false })
		.limit(ACTIVITY_PAGE);
	if (error) throw error;
	return data as ActivityRow[];
};

/** Puts a deleted Entry back, with the Items deleted along with it (the server's `restore_entry`). */
export const restoreEntry = async (entryId: string) => {
	const { error } = await supabase.rpc("restore_entry", { entry_id: entryId });
	if (error) throw error;
};

/** The query key the Activity log is cached under. */
export const activityKey = (householdId: string | undefined) =>
	["activity", householdId] as const;
