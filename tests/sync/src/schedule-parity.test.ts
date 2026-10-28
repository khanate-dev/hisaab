import { dueDates, type Schedule, shiftCalendarDate } from "@hisaab/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { adminClient } from "./users";

// ADR-0004: devices and the server's hourly Auto-record job derive the same Occurrence ids from the same due dates,
// so the SQL schedule (`private.schedule_dates`) must agree with the domain's `dueDates` exactly.
describe("schedule parity", () => {
	it("SQL due dates are the domain's, for any schedule and range", async () => {
		const admin = adminClient();
		const date = fc
			.integer({ min: 0, max: 365 * 8 })
			.map((d) => shiftCalendarDate("2022-01-01", d));
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom("monthly", "weekly", "yearly"),
				fc.integer({ min: 1, max: 6 }),
				fc.integer({ min: 1, max: 31 }),
				date,
				fc.option(fc.integer({ min: 0, max: 900 })),
				fc.integer({ min: -60, max: 600 }),
				fc.integer({ min: 0, max: 400 }),
				async (frequency, interval, day, starts, length, fromOffset, span) => {
					const schedule: Schedule = {
						frequency: frequency as Schedule["frequency"],
						interval,
						day_of_month: frequency === "monthly" ? day : null,
						starts_on: starts,
						ends_on: length === null ? null : shiftCalendarDate(starts, length),
					};
					const from = shiftCalendarDate(starts, fromOffset);
					const to = shiftCalendarDate(from, span);
					const { data, error } = await admin.rpc("schedule_dates", {
						frequency: schedule.frequency,
						every: schedule.interval,
						day_of_month: schedule.day_of_month,
						starts_on: schedule.starts_on,
						ends_on: schedule.ends_on,
						from_day: from,
						to_day: to,
					});
					if (error) throw error;
					expect(data).toEqual(dueDates(schedule, from, to));
				},
			),
			{ numRuns: 60 },
		);
	});
});
