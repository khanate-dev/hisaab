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

/** How many of the latest changes a read returns. */
const PAGE = 100;

/** The household's latest changes, newest first, from the server; the log never syncs to devices. */
export const fetchActivityLog = async (
	householdId: string,
): Promise<ActivityRow[]> => {
	const { data, error } = await supabase
		.from("activity_log")
		.select(
			"id, table_name, row_id, action, actor_id, device_time, synced_at, before, after",
		)
		.eq("household_id", householdId)
		.order("synced_at", { ascending: false })
		.order("id", { ascending: false })
		.limit(PAGE);
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
