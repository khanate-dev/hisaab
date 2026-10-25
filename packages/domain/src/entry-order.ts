// The one order of a household's Entries: by date, then time (an Entry without one counts as the start of its day),
// then when it was recorded, then id so ties are stable. Balance history and the Entries list both use it.

export type Dated = {
	id: string;
	occurred_on: string;
	occurred_time?: string | null;
	created_at: string;
};

/** Ordinal, not locale-aware: ISO dates, HH:MM times and timestamps sort correctly as plain strings. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Oldest first. */
export const chronological = (a: Dated, b: Dated) =>
	compare(a.occurred_on, b.occurred_on) ||
	compare(a.occurred_time ?? "", b.occurred_time ?? "") ||
	compare(a.created_at, b.created_at) ||
	compare(a.id, b.id);

/** Newest first. */
export const newestFirst = (a: Dated, b: Dated) => chronological(b, a);
