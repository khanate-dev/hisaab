import { calendarDateIn } from "@hisaab/domain";

/** Now, as stored in created_at columns. */
export const nowIso = () => new Date().toISOString();

/** This device's IANA timezone. */
export const deviceTimeZone = () =>
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** The timezone Entry dates are in: the household's once it's set, otherwise this device's. */
export const entryTimeZone = (household?: { timezone: string | null } | null) =>
	household?.timezone ?? deviceTimeZone();

/** Today, YYYY-MM-DD, in a timezone. */
export const todayIn = (timeZone: string) =>
	calendarDateIn(new Date(), timeZone);
