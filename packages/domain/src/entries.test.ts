import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	descriptionSuggestions,
	frequentCategories,
	isFlowKind,
	magnitude,
	recentDescriptions,
	signedAmount,
	householdTransferHalves,
} from "./entries";
import { newestFirst } from "./entry-order";
import { addMoney, isNegative, isZero, moneyEquals, parseMoney } from "./money";

const money = fc
	.integer({ min: -10_000_000, max: 10_000_000 })
	.map((units) => parseMoney((units / 100).toFixed(2), "PKR"));
const flowKind = fc.constantFrom("expense" as const, "income" as const);

describe("isFlowKind", () => {
	it("is true for exactly Expense and Income", () => {
		fc.assert(
			fc.property(
				fc.oneof(flowKind, fc.string(), fc.constant("balance_adjustment")),
				(kind) => {
					expect(isFlowKind(kind)).toBe(
						kind === "expense" || kind === "income",
					);
				},
			),
		);
	});
});

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

describe("recentDescriptions", () => {
	const normal = (d: string | null) => d?.trim().toLowerCase() ?? "";

	it("offers each of the kind's recent descriptions once, as its latest Entry, up to the limit", () => {
		fc.assert(
			fc.property(
				entries,
				flowKind,
				fc.integer({ min: 1, max: 6 }),
				(list, kind, limit) => {
					const chips = recentDescriptions(list, kind, { limit });
					expect(chips.length).toBeLessThanOrEqual(limit);
					const keys = chips.map((c) => normal(c.description));
					expect(new Set(keys).size).toBe(keys.length);
					for (const chip of chips) {
						expect(chip.kind).toBe(kind);
						expect(normal(chip.description)).not.toBe("");
						const same = list.filter(
							(e) =>
								e.kind === kind &&
								normal(e.description) === normal(chip.description),
						);
						expect(same.toSorted(newestFirst)[0]).toBe(chip);
					}
				},
			),
		);
	});

	it("puts the more frequent descriptions first", () => {
		fc.assert(
			fc.property(entries, flowKind, (list, kind) => {
				const chips = recentDescriptions(list, kind, { limit: 25, window: 25 });
				const count = (d: string | null) =>
					list.filter(
						(e) => e.kind === kind && normal(e.description) === normal(d),
					).length;
				const counts = chips.map((c) => count(c.description));
				expect(counts).toEqual(counts.toSorted((a, b) => b - a));
			}),
		);
	});

	it("only looks at the latest Entries", () => {
		fc.assert(
			fc.property(
				entries,
				flowKind,
				fc.integer({ min: 1, max: 10 }),
				(list, kind, window) => {
					const latest = list
						.filter((e) => e.kind === kind && normal(e.description) !== "")
						.toSorted(newestFirst)
						.slice(0, window);
					for (const chip of recentDescriptions(list, kind, {
						window,
						limit: 25,
					}))
						expect(latest).toContain(chip);
				},
			),
		);
	});
});

describe("frequentCategories", () => {
	const categorized = fc.uniqueArray(
		fc.record({
			id: fc.uuid(),
			kind: flowKind,
			category_id: fc.option(fc.constantFrom("c1", "c2", "c3", "c4"), {
				nil: null,
			}),
			occurred_on: fc
				.integer({ min: 1, max: 28 })
				.map((d) => `2026-10-${String(d).padStart(2, "0")}`),
			created_at: fc
				.integer({ min: 0, max: 1000 })
				.map((s) => new Date(Date.UTC(2026, 9, 1, 0, 0, s)).toISOString()),
		}),
		{ selector: (e) => e.id, maxLength: 25 },
	);

	it("lists each Category the kind's recent Entries used once, most used first, up to the limit", () => {
		fc.assert(
			fc.property(
				categorized,
				flowKind,
				fc.integer({ min: 1, max: 5 }),
				(list, kind, limit) => {
					const ids = frequentCategories(list, kind, { limit, window: 25 });
					expect(ids.length).toBeLessThanOrEqual(limit);
					expect(new Set(ids).size).toBe(ids.length);
					const uses = (id: string) =>
						list.filter((e) => e.kind === kind && e.category_id === id).length;
					for (const id of ids) expect(uses(id)).toBeGreaterThan(0);
					const counts = ids.map(uses);
					expect(counts).toEqual(counts.toSorted((a, b) => b - a));
				},
			),
		);
	});
});

describe("householdTransferHalves", () => {
	it("leaves one Wallet with exactly what arrives in the other", () => {
		fc.assert(
			fc.property(
				fc
					.integer({ min: -10_000_000, max: 10_000_000 })
					.filter((n) => n !== 0),
				(units) => {
					const { leaves, arrives } = householdTransferHalves(
						parseMoney((units / 100).toFixed(2), "PKR"),
					);
					expect(isNegative(leaves)).toBe(true);
					expect(isNegative(arrives)).toBe(false);
					expect(isZero(addMoney(leaves, arrives))).toBe(true);
				},
			),
		);
	});
});
