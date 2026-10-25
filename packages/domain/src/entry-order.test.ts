import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { chronological, newestFirst } from "./entry-order";

const occurrence = fc.record({
	id: fc.uuid(),
	occurred_on: fc.integer({ min: 1, max: 9 }).map((d) => `2026-10-0${d}`),
	occurred_time: fc.option(fc.constantFrom("00:00", "08:00", "23:59"), {
		nil: null,
	}),
	created_at: fc
		.integer({ min: 0, max: 9 })
		.map((s) => `2026-10-01T00:00:0${s}.000Z`),
});

describe("Entry order", () => {
	it("is a total order: by date, then time (none first), then when recorded", () => {
		fc.assert(
			fc.property(fc.array(occurrence, { maxLength: 20 }), (list) => {
				const sorted = list.toSorted(chronological);
				for (let i = 1; i < sorted.length; i++) {
					const [a, b] = [sorted[i - 1], sorted[i]];
					if (!a || !b) continue;
					expect(a.occurred_on <= b.occurred_on).toBe(true);
					if (a.occurred_on === b.occurred_on)
						expect((a.occurred_time ?? "") <= (b.occurred_time ?? "")).toBe(
							true,
						);
				}
				expect(list.toSorted(newestFirst)).toEqual(sorted.toReversed());
			}),
		);
	});

	it("only calls two Entries equal when they're the same Entry", () => {
		fc.assert(
			fc.property(occurrence, occurrence, (a, b) => {
				expect(chronological(a, b) === 0).toBe(
					a.id === b.id &&
						a.occurred_on === b.occurred_on &&
						(a.occurred_time ?? "") === (b.occurred_time ?? "") &&
						a.created_at === b.created_at,
				);
				expect(Math.sign(chronological(a, b))).toBe(
					-Math.sign(chronological(b, a)),
				);
			}),
		);
	});
});
