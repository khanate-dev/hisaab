import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { shiftCalendarDate } from "./dates";
import {
	dueDates,
	dueOccurrences,
	nameBasedUuid,
	nextDueDate,
	occurrenceEntryId,
	occurrenceId,
	type RuleLike,
	type Schedule,
} from "./recurring";

const date = fc
	.integer({ min: 0, max: 365 * 20 })
	.map((days) => shiftCalendarDate("2010-01-01", days));

const schedule: fc.Arbitrary<Schedule> = fc
	.record({
		frequency: fc.constantFrom("monthly", "weekly", "yearly") as fc.Arbitrary<
			Schedule["frequency"]
		>,
		interval: fc.integer({ min: 1, max: 6 }),
		day: fc.integer({ min: 1, max: 31 }),
		starts_on: date,
		length: fc.option(fc.integer({ min: 0, max: 800 })),
	})
	.map(({ frequency, interval, day, starts_on, length }) => ({
		frequency,
		interval,
		day_of_month: frequency === "monthly" ? day : null,
		starts_on,
		ends_on: length === null ? null : shiftCalendarDate(starts_on, length),
	}));

const window = (s: Schedule) => ({
	from: s.starts_on,
	to: shiftCalendarDate(s.starts_on, 1200),
});

const daysBetween = (a: string, b: string) =>
	Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

describe("dueDates", () => {
	it("are in order, unrepeated, within the rule's start and end and the range asked for", () => {
		fc.assert(
			fc.property(schedule, date, date, (s, a, b) => {
				const [from, to] = a <= b ? [a, b] : [b, a];
				const dates = dueDates(s, from, to);
				for (const [i, d] of dates.entries()) {
					expect(d >= from && d <= to && d >= s.starts_on).toBe(true);
					if (s.ends_on !== null) expect(d <= s.ends_on).toBe(true);
					if (i > 0) expect(d > (dates[i - 1] ?? "")).toBe(true);
				}
			}),
		);
	});

	it("fall on the rule's day: monthly on day N or the month's last, weekly on the weekday, yearly on the date", () => {
		fc.assert(
			fc.property(schedule, (s) => {
				const { from, to } = window(s);
				for (const d of dueDates(s, from, to)) {
					const [year, month, day] = d.split("-").map(Number) as [
						number,
						number,
						number,
					];
					const monthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
					if (s.frequency === "monthly")
						expect(day).toBe(Math.min(s.day_of_month ?? 0, monthLength));
					if (s.frequency === "weekly")
						expect(daysBetween(s.starts_on, d) % (7 * s.interval)).toBe(0);
					if (s.frequency === "yearly") {
						expect(d.slice(5, 7)).toBe(s.starts_on.slice(5, 7));
						const startDay = Number(s.starts_on.slice(8));
						expect(day).toBe(Math.min(startDay, monthLength));
					}
				}
			}),
		);
	});

	it("come round every interval: monthly ones that many months apart, never skipping one", () => {
		fc.assert(
			fc.property(schedule, (s) => {
				if (s.frequency !== "monthly") return;
				const { from, to } = window(s);
				const months = dueDates(s, from, to).map((d) => {
					const [year, month] = d.split("-").map(Number) as [number, number];
					return year * 12 + month;
				});
				for (let i = 1; i < months.length; i += 1)
					expect((months[i] ?? 0) - (months[i - 1] ?? 0)).toBe(s.interval);
			}),
		);
	});

	it("are the same however the range is split", () => {
		fc.assert(
			fc.property(schedule, fc.integer({ min: 0, max: 1200 }), (s, cut) => {
				const { from, to } = window(s);
				const middle = shiftCalendarDate(from, cut);
				expect([
					...dueDates(s, from, middle),
					...dueDates(s, shiftCalendarDate(middle, 1), to),
				]).toEqual(dueDates(s, from, to));
			}),
		);
	});

	it("put the 31st on each month's last day", () => {
		expect(
			dueDates(
				{
					frequency: "monthly",
					interval: 1,
					day_of_month: 31,
					starts_on: "2026-01-15",
					ends_on: null,
				},
				"2026-01-01",
				"2026-04-30",
			),
		).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
	});
});

describe("nextDueDate", () => {
	it("is the first due date after today", () => {
		fc.assert(
			fc.property(schedule, fc.integer({ min: -30, max: 900 }), (s, offset) => {
				const today = shiftCalendarDate(s.starts_on, offset);
				const next = nextDueDate(s, today);
				const { to } = window(s);
				const later = dueDates(s, shiftCalendarDate(today, 1), to)[0] ?? null;
				if (later !== null) expect(next).toBe(later);
			}),
		);
	});
});

describe("dueOccurrences", () => {
	const rule = (s: Schedule): RuleLike => ({ ...s, id: "r1", mode: "confirm" });

	it("are every due date by today that's not confirmed, skipped or still snoozed", () => {
		fc.assert(
			fc.property(
				schedule,
				fc.integer({ min: 0, max: 600 }),
				fc.array(
					fc.record({
						pick: fc.nat(),
						state: fc.constantFrom(
							"confirmed",
							"skipped",
							"snoozed",
						) as fc.Arbitrary<"confirmed" | "skipped" | "snoozed">,
						snooze: fc.integer({ min: -10, max: 10 }),
					}),
					{ maxLength: 5 },
				),
				(s, offset, picks) => {
					const today = shiftCalendarDate(s.starts_on, offset);
					const all = dueDates(s, s.starts_on, today);
					const records = all.length
						? picks.map(({ pick, state, snooze }) => ({
								rule_id: "r1",
								due_on: all[pick % all.length] ?? "",
								state,
								snoozed_until:
									state === "snoozed" ? shiftCalendarDate(today, snooze) : null,
							}))
						: [];
					const due = dueOccurrences([rule(s)], records, today).map(
						(o) => o.dueOn,
					);
					for (const d of all) {
						const mine = records.filter((r) => r.due_on === d);
						const handled = mine.some(
							(r) => r.state !== "snoozed" || (r.snoozed_until ?? "") > today,
						);
						expect(due.includes(d)).toBe(!handled);
					}
					expect(due.every((d) => all.includes(d))).toBe(true);
				},
			),
		);
	});
});

describe("Occurrence ids", () => {
	it("are RFC 9562 name-based UUIDs", () => {
		// The RFC's DNS namespace example.
		expect(
			nameBasedUuid("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com"),
		).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
	});

	it("are the same for the same rule and date, and differ otherwise, the Entry's too", () => {
		const id = fc.uuid();
		fc.assert(
			fc.property(id, id, date, date, (r1, r2, d1, d2) => {
				expect(occurrenceId(r1, d1)).toBe(occurrenceId(r1, d1));
				expect(occurrenceEntryId(r1, d1)).not.toBe(occurrenceId(r1, d1));
				if (r1 !== r2 || d1 !== d2) {
					expect(occurrenceId(r1, d1)).not.toBe(occurrenceId(r2, d2));
					expect(occurrenceEntryId(r1, d1)).not.toBe(occurrenceEntryId(r2, d2));
				}
			}),
		);
	});
});
