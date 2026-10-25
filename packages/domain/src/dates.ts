// Entry dates are calendar dates (and optional HH:MM times) in the household's timezone, never instants: an Entry
// made at 23:30 in Karachi is dated that day wherever it's later read.

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real date written YYYY-MM-DD: 2026-02-29 isn't one. */
export const isCalendarDate = (text: string) => {
	const match = CALENDAR_DATE.exec(text);
	if (!match) return false;
	const [, year, month, day] = match.map(Number) as [
		number,
		number,
		number,
		number,
	];
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
};

/** A wall-clock time written HH:MM, 00:00 to 23:59. */
export const isTimeOfDay = (text: string) => TIME_OF_DAY.test(text);

const parts = (
	instant: Date,
	timeZone: string,
	options: Intl.DateTimeFormatOptions,
) =>
	Object.fromEntries(
		new Intl.DateTimeFormat("en-US", { timeZone, ...options })
			.formatToParts(instant)
			.map((part) => [part.type, part.value]),
	);

/** The calendar date, YYYY-MM-DD, that an instant falls on in a timezone. */
export const calendarDateIn = (instant: Date, timeZone: string) => {
	const { year, month, day } = parts(instant, timeZone, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return `${year}-${month}-${day}`;
};

/** The wall-clock time, HH:MM, that an instant shows in a timezone. */
export const timeOfDayIn = (instant: Date, timeZone: string) => {
	const { hour, minute } = parts(instant, timeZone, {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	return `${hour}:${minute}`;
};
