import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { descriptionSuggestions, magnitude, signedAmount } from "./entries";
import { newestFirst } from "./entry-order";
import { isNegative, isZero, moneyEquals, parseMoney } from "./money";

const money = fc
	.integer({ min: -10_000_000, max: 10_000_000 })
	.map((units) => parseMoney((units / 100).toFixed(2), "PKR"));
const flowKind = fc.constantFrom("expense" as const, "income" as const);

describe("signedAmount", () => {
	it("takes money out for an Expense and brings it in for an Income, keeping how much", () => {
		fc.assert(
			fc.property(flowKind, money, (kind, amount) => {
				const signed = signedAmount(kind, amount);
				expect(moneyEquals(magnitude(signed), magnitude(amount))).toBe(true);
				if (kind === "expense")
					expect(isNegative(signed) || isZero(signed)).toBe(true);
				else expect(isNegative(signed)).toBe(false);
			}),
		);
	});
});

const entries = fc.uniqueArray(
	fc.record({
		id: fc.uuid(),
		kind: flowKind,
		description: fc.option(
			fc.constantFrom("Bread", "bread ", "Milk", "Rent", "Bus fare", ""),
			{
				nil: null,
			},
		),
		occurred_on: fc
			.integer({ min: 1, max: 28 })
			.map((d) => `2026-10-${String(d).padStart(2, "0")}`),
		occurred_time: fc.option(fc.constantFrom("08:00", "12:30", "21:15"), {
			nil: null,
		}),
		created_at: fc
			.integer({ min: 0, max: 1000 })
			.map((s) => new Date(Date.UTC(2026, 9, 1, 0, 0, s)).toISOString()),
	}),
	{ selector: (e) => e.id, maxLength: 25 },
);
const query = fc.constantFrom("b", "BR", "milk", "re", "us", " ", "x");

describe("descriptionSuggestions", () => {
	it("offers only matching past Entries of the same kind, one per description, newest first, up to the limit", () => {
		fc.assert(
			fc.property(
				entries,
				query,
				flowKind,
				fc.integer({ min: 1, max: 5 }),
				(list, typed, kind, limit) => {
					const found = descriptionSuggestions(list, typed, kind, limit);
					const wanted = typed.trim().toLowerCase();
					expect(found.length).toBeLessThanOrEqual(limit);
					for (const entry of found) {
						expect(entry.kind).toBe(kind);
						expect(entry.description?.toLowerCase()).toContain(wanted);
					}
					const keys = found.map((e) => e.description?.trim().toLowerCase());
					expect(new Set(keys).size).toBe(keys.length);
					expect(found).toEqual(found.toSorted(newestFirst));
				},
			),
		);
	});

	it("suggests each description from its most recent Entry", () => {
		fc.assert(
			fc.property(entries, query, flowKind, (list, typed, kind) => {
				for (const entry of descriptionSuggestions(list, typed, kind, 25)) {
					const same = list.filter(
						(e) =>
							e.kind === kind &&
							e.description?.trim().toLowerCase() ===
								entry.description?.trim().toLowerCase(),
					);
					expect(same.toSorted(newestFirst)[0]).toBe(entry);
				}
			}),
		);
	});

	it("misses nothing that matches, short of the limit", () => {
		fc.assert(
			fc.property(entries, query, flowKind, (list, typed, kind) => {
				const wanted = typed.trim().toLowerCase();
				const expected = new Set(
					list
						.filter((e) => e.kind === kind && wanted !== "")
						.map((e) => e.description?.trim().toLowerCase() ?? "")
						.filter((d) => d !== "" && d.includes(wanted)),
				);
				const found = descriptionSuggestions(list, typed, kind, 25);
				expect(
					new Set(found.map((e) => e.description?.trim().toLowerCase())),
				).toEqual(expected);
			}),
		);
	});
});
