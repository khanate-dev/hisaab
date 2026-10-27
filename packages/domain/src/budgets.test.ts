import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	budgetFor,
	budgetMonthDays,
	budgetMonthOf,
	budgetMonthRange,
	categoryTotals,
	type CountedEntry,
	dayOfBudgetMonth,
	pace,
	shiftBudgetMonth,
} from "./budgets";
import { shiftCalendarDate } from "./dates";
import { moneyEquals, parseMoney, sumMoney } from "./money";

const date = fc
	.integer({ min: 0, max: 365 * 30 })
	.map((days) => shiftCalendarDate("2000-01-01", days));
const startDay = fc.integer({ min: 1, max: 28 });
const month = fc
	.tuple(fc.integer({ min: 2000, max: 2040 }), fc.integer({ min: 1, max: 12 }))
	.map(([y, m]) => `${y}-${String(m).padStart(2, "0")}`);

describe("Budget months", () => {
	it("contain every date said to fall in them", () => {
		fc.assert(
			fc.property(date, startDay, (d, start) => {
				const { first, last } = budgetMonthRange(
					budgetMonthOf(d, start),
					start,
				);
				expect(first <= d && d <= last).toBe(true);
			}),
		);
	});

	it("follow one another with no gap and no overlap, 28 to 31 days each", () => {
		fc.assert(
			fc.property(month, startDay, (m, start) => {
				const next = budgetMonthRange(shiftBudgetMonth(m, 1), start);
				expect(shiftCalendarDate(budgetMonthRange(m, start).last, 1)).toBe(
					next.first,
				);
				const days = budgetMonthDays(m, start);
				expect(days >= 28 && days <= 31).toBe(true);
			}),
		);
	});

	it("start on the chosen day, which is day 1", () => {
		fc.assert(
			fc.property(month, startDay, (m, start) => {
				const { first, last } = budgetMonthRange(m, start);
				expect(Number(first.slice(8))).toBe(start);
				expect(dayOfBudgetMonth(first, start)).toBe(1);
				expect(dayOfBudgetMonth(last, start)).toBe(budgetMonthDays(m, start));
			}),
		);
	});

	it("shift back the way they shifted forward", () => {
		fc.assert(
			fc.property(month, fc.integer({ min: -300, max: 300 }), (m, n) => {
				expect(shiftBudgetMonth(shiftBudgetMonth(m, n), -n)).toBe(m);
			}),
		);
	});
});

describe("budgetFor", () => {
	const amount = fc.integer({ min: 0, max: 1_000_000 }).map(String);

	it("is the month's override, else the latest standing amount from before it (none once stopped), else none", () => {
		fc.assert(
			fc.property(
				month,
				fc.array(fc.tuple(month, fc.option(amount)), { maxLength: 6 }),
				fc.option(amount),
				(m, standing, override) => {
					const rows = standing.map(([validFrom, a]) => ({
						category_id: "c1",
						valid_from: validFrom,
						amount: a,
					}));
					const overrides =
						override === null
							? []
							: [{ category_id: "c1", month: m, amount: override }];
					const got = budgetFor("c1", m, rows, overrides, "PKR");
					const latest = rows
						.filter((r) => r.valid_from <= m)
						.toSorted((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
					const want = override ?? latest?.amount ?? null;
					expect(got === null ? null : got.toString()).toBe(
						want === null ? null : parseMoney(want, "PKR").toString(),
					);
				},
			),
		);
	});
});

describe("categoryTotals", () => {
	const range = { first: "2026-10-01", last: "2026-10-31" };
	const parentOf = new Map<string, string | null>([
		["food", null],
		["groceries", "food"],
		["salary", null],
	]);

	it("counts Expenses and Incomes in the range, Subcategories into their parent, nothing else", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						kind: fc.constantFrom(
							"expense",
							"income",
							"balance_adjustment",
							"transfer",
						),
						units: fc.integer({ min: 1, max: 100_000 }),
						category_id: fc.constantFrom("food", "groceries", "salary"),
						occurred_on: fc.constantFrom(
							"2026-09-30",
							"2026-10-01",
							"2026-10-15",
							"2026-10-31",
							"2026-11-01",
						),
					}),
					{ maxLength: 20 },
				),
				(rows) => {
					const entries: CountedEntry[] = rows.map((r, i) => ({
						id: `e${i}`,
						kind: r.kind,
						amount: (r.kind === "expense" ? -r.units : r.units).toString(),
						category_id:
							r.kind === "expense" || r.kind === "income"
								? r.category_id
								: null,
						occurred_on: r.occurred_on,
					}));
					const totals = categoryTotals(entries, [], parentOf, range, "PKR");
					const counted = (category: string) =>
						sumMoney(
							entries
								.filter(
									(e) =>
										(e.kind === "expense" || e.kind === "income") &&
										e.category_id === category &&
										e.occurred_on >= range.first &&
										e.occurred_on <= range.last,
								)
								.map((e) => parseMoney(e.amount.replace("-", ""), "PKR")),
							"PKR",
						);
					const food = sumMoney([counted("food"), counted("groceries")], "PKR");
					expect(
						moneyEquals(totals.get("food") ?? parseMoney("0", "PKR"), food),
					).toBe(true);
					expect(
						moneyEquals(
							totals.get("groceries") ?? parseMoney("0", "PKR"),
							counted("groceries"),
						),
					).toBe(true);
				},
			),
		);
	});

	it("counts an itemized Expense's Items against their own Categories", () => {
		const totals = categoryTotals(
			[
				{
					id: "e1",
					kind: "expense",
					amount: "-500",
					category_id: "food",
					occurred_on: "2026-10-02",
				},
			],
			[
				{ entry_id: "e1", amount: "300", category_id: "groceries" },
				{ entry_id: "e1", amount: "200", category_id: "salary" },
			],
			parentOf,
			range,
			"PKR",
		);
		expect(totals.get("groceries")?.toString()).toBe("300");
		expect(totals.get("food")?.toString()).toBe("300");
		expect(totals.get("salary")?.toString()).toBe("200");
	});
});

describe("pace", () => {
	it("says how much is used, and whether it runs ahead of the month", () => {
		expect(
			pace(parseMoney("580", "PKR"), parseMoney("1000", "PKR"), 12, 30),
		).toEqual({
			day: 12,
			days: 30,
			percentUsed: 58,
			ahead: true,
		});
		expect(
			pace(parseMoney("100", "PKR"), parseMoney("0", "PKR"), 1, 30).percentUsed,
		).toBeNull();
	});

	it("runs ahead exactly when the share used passes the share of the month gone", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 10_000 }),
				fc.integer({ min: 1, max: 10_000 }),
				fc.integer({ min: 28, max: 31 }),
				fc.integer({ min: 1, max: 28 }),
				(used, budget, days, day) => {
					const result = pace(
						parseMoney(String(used), "PKR"),
						parseMoney(String(budget), "PKR"),
						day,
						days,
					);
					const percent = Math.round((used * 100) / budget);
					expect(result.percentUsed).toBe(percent);
					expect(result.ahead).toBe(percent * days > 100 * day);
				},
			),
		);
	});
});
