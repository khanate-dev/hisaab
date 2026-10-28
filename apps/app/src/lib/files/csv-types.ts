/** What a statement export can be labelled as; some banks send CSV as plain text or Excel's type. */
export const CSV_TYPES = [
	"text/csv",
	"text/comma-separated-values",
	"text/plain",
	"application/vnd.ms-excel",
] as const;
