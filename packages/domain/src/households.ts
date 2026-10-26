/** The days a Budget month may start on: every month has them, so no month skips its start (CONTEXT.md). */
export const BUDGET_MONTH_START_DAYS = { first: 1, last: 28 } as const;

/** A typed Budget month start day as a number: a whole day from the 1st to the 28th, or null. */
export const parseBudgetMonthStartDay = (text: string): number | null => {
	const trimmed = text.trim();
	if (!/^\d{1,2}$/.test(trimmed)) return null;
	const day = Number(trimmed);
	return day >= BUDGET_MONTH_START_DAYS.first &&
		day <= BUDGET_MONTH_START_DAYS.last
		? day
		: null;
};

/** Whether a name is an IANA timezone this runtime knows, as the household's timezone must be. */
export const isTimeZone = (name: string) => {
	if (name.trim() !== name || name.length === 0) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: name });
		return true;
	} catch {
		return false;
	}
};
