import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	calendarDateIn,
	isCalendarDate,
	isTimeOfDay,
	shiftCalendarDate,
} from "./dates";

// Entry dates are calendar dates in the household's timezone (spec §3.3).

const instant = fc.date({
	noInvalidDate: true,
	min: new Date("1990-01-01T00:00:00Z"),
	max: new Date("2100-12-31T23:59:59Z"),
});
const timeZone = fc.constantFrom(
	"UTC",
	"Asia/Karachi",
	"Asia/Kolkata",
	"America/Los_Angeles",
	"Pacific/Kiritimati",
	"Pacific/Pago_Pago",
	"Europe/London",
);
const DAY = 24 * 60 * 60 * 1000;

describe("calendarDateIn", () => {
	it("is a real calendar date", () => {
		fc.assert(
			fc.property(instant, timeZone, (at, zone) => {
				expect(isCalendarDate(calendarDateIn(at, zone))).toBe(true);
			}),
		);
	});

	it("is the UTC date in UTC", () => {
		fc.assert(
			fc.property(instant, (at) => {
				expect(calendarDateIn(at, "UTC")).toBe(at.toISOString().slice(0, 10));
			}),
		);
	});

	it("is never more than a day from the UTC date", () => {
		fc.assert(
			fc.property(instant, timeZone, (at, zone) => {
				const local = Date.parse(`${calendarDateIn(at, zone)}T00:00:00Z`);
				const utc = Date.parse(`${at.toISOString().slice(0, 10)}T00:00:00Z`);
				expect(Math.abs(local - utc)).toBeLessThanOrEqual(DAY);
			}),
		);
	});

	it("dates a late-evening Karachi Entry that day, though it's still morning in Los Angeles", () => {
		const at = new Date("2026-10-26T18:30:00Z"); // 23:30 in Karachi, 11:30 in Los Angeles
		expect(calendarDateIn(at, "Asia/Karachi")).toBe("2026-10-26");
		expect(
			calendarDateIn(new Date("2026-10-26T20:00:00Z"), "Asia/Karachi"),
		).toBe("2026-10-27");
		expect(calendarDateIn(at, "America/Los_Angeles")).toBe("2026-10-26");
	});
});

describe("isCalendarDate", () => {
	it("accepts exactly the days each month has", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1000, max: 9999 }),
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: 1, max: 31 }),
				(year, month, day) => {
					const text = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
					const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
					expect(isCalendarDate(text)).toBe(day <= daysInMonth);
				},
			),
		);
	});

	it("rejects anything not written YYYY-MM-DD", () => {
		for (const text of [
			"2026-1-05",
			"26-10-05",
			"2026/10/05",
			"",
			"2026-10-05T00:00",
		])
			expect(isCalendarDate(text)).toBe(false);
	});
});

describe("isTimeOfDay", () => {
	it("accepts exactly 00:00 to 23:59", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 99 }),
				fc.integer({ min: 0, max: 99 }),
				(h, m) => {
					const text = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
					expect(isTimeOfDay(text)).toBe(h < 24 && m < 60);
				},
			),
		);
	});
});

describe("shiftCalendarDate", () => {
	const date = instant.map((at) => at.toISOString().slice(0, 10));
	const days = fc.integer({ min: -400, max: 400 });

	it("lands on a real date, and shifting back returns", () => {
		fc.assert(
			fc.property(date, days, (from, n) => {
				const shifted = shiftCalendarDate(from, n);
				expect(isCalendarDate(shifted)).toBe(true);
				expect(shiftCalendarDate(shifted, -n)).toBe(from);
			}),
		);
	});

	it("moves by exactly that many days", () => {
		fc.assert(
			fc.property(date, days, (from, n) => {
				const gap =
					Date.parse(`${shiftCalendarDate(from, n)}T00:00:00Z`) -
					Date.parse(`${from}T00:00:00Z`);
				expect(gap).toBe(n * DAY);
			}),
		);
	});
});
