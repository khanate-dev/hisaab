/** Columns that change on every write, or never mean anything to a person reading the log. */
export const QUIET_COLUMNS: ReadonlySet<string> = new Set([
	"id",
	"household_id",
	"created_at",
	"created_by",
	"_metadata",
]);
