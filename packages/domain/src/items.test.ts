import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { itemize, withRest } from "./items";
import { isNegative, isZero, moneyEquals, parseMoney, sumMoney } from "./money";

const positive = fc
	.integer({ min: 1, max: 10_000_000 })
	.map((units) => parseMoney((units / 100).toFixed(2), "PKR"));
const total = fc
	.integer({ min: 0, max: 10_000_000 })
	.map((units) => parseMoney((units / 100).toFixed(2), "PKR"));
const items = fc.array(
	positive.map((amount) => ({ amount })),
	{ maxLength: 12 },
);

describe("withRest", () => {
	it("always leaves Items that add up to the Expense's total", () => {
		fc.assert(
			fc.property(total, items, (receipt, split) => {
				const saved = withRest(receipt, split, (rest) => ({ amount: rest }));
				if (saved.items.length === 0) return;
				expect(
					moneyEquals(
						sumMoney(
							saved.items.map((i) => i.amount),
							"PKR",
						),
						saved.total,
					),
				).toBe(true);
			}),
		);
	});

	it("keeps the Items split out, in order, adding at most one Rest Item after them", () => {
		fc.assert(
			fc.property(total, items, (receipt, split) => {
				const saved = withRest(receipt, split, (rest) => ({
					amount: rest,
					rest: true,
				}));
				expect(saved.items.slice(0, split.length)).toEqual(split);
				expect(saved.items.length - split.length).toBeLessThanOrEqual(1);
			}),
		);
	});

	it("adds no Items to an Expense that has none", () => {
		fc.assert(
			fc.property(total, (receipt) => {
				expect(
					withRest(receipt, [], (rest) => ({ amount: rest })).items,
				).toEqual([]);
			}),
		);
	});
});

describe("itemize", () => {
	it("leaves a Rest that's never negative, growing the total when the Items run over", () => {
		fc.assert(
			fc.property(total, items, (receipt, split) => {
				const amounts = split.map((i) => i.amount);
				const { total: grown, rest, over } = itemize(receipt, amounts);
				expect(isNegative(rest)).toBe(false);
				const sum = sumMoney(amounts, "PKR");
				if (over) {
					expect(moneyEquals(grown, sum)).toBe(true);
					expect(isZero(rest)).toBe(true);
				} else {
					expect(moneyEquals(grown, receipt)).toBe(true);
				}
			}),
		);
	});
});
