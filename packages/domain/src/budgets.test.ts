import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	budgetFor,
	budgetMonthView,
	budgetMonthDays,
	budgetMonthOf,
	budgetMonthRange,
	categoryTotals,
	type CountedEntry,
	dayOfBudgetMonth,
	pace,
	shiftBudgetMonth,
	topBudgets,
} from "./budgets";
import type { CategoryLike } from "./categories";
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
	const instant = fc
		.integer({ min: 0, max: 1_000_000 })
		.map((n) => new Date(1_800_000_000_000 + n * 1000).toISOString());
	const standingRow = fc.record({
		category_id: fc.constant("c1"),
		valid_from: month,
		amount: fc.option(amount),
		created_at: instant,
	});
	const shown = (money: ReturnType<typeof budgetFor>) =>
		money === null ? null : money.toString();

	it("is a month's override, whatever the standing amounts", () => {
		fc.assert(
			fc.property(
				month,
				fc.array(standingRow, { maxLength: 6 }),
				amount,
				(m, rows, a) => {
					const override = {
						category_id: "c1",
						month: m,
						amount: a,
						created_at: "2027-01-01T00:00:00.000Z",
					};
					expect(shown(budgetFor("c1", m, rows, [override], "PKR"))).toBe(
						parseMoney(a, "PKR").toString(),
					);
				},
			),
		);
	});

	it("is unchanged by a standing amount from a later month, or by another Category's", () => {
		fc.assert(
			fc.property(
				month,
				fc.array(standingRow, { maxLength: 6 }),
				amount,
				fc.integer({ min: 1, max: 24 }),
				(m, rows, a, later) => {
					const before = shown(budgetFor("c1", m, rows, [], "PKR"));
					const more = [
						...rows,
						{
							category_id: "c1",
							valid_from: shiftBudgetMonth(m, later),
							amount: a,
							created_at: "2027-01-01T00:00:00.000Z",
						},
						{
							category_id: "c2",
							valid_from: m,
							amount: a,
							created_at: "2027-01-01T00:00:00.000Z",
						},
					];
					expect(shown(budgetFor("c1", m, more, [], "PKR"))).toBe(before);
				},
			),
		);
	});

	it("lasts from the month it's set in until a later one, and a stopped one is none", () => {
		fc.assert(
			fc.property(
				month,
				fc.array(standingRow, { maxLength: 6 }),
				fc.option(amount),
				fc.integer({ min: 0, max: 24 }),
				(m, rows, a, after) => {
					// Set last, from m on; no row of `rows` falls between m and the month asked about.
					const set = {
						category_id: "c1",
						valid_from: m,
						amount: a,
						created_at: "2099-01-01T00:00:00.000Z",
					};
					const asked = shiftBudgetMonth(m, after);
					const earlier = rows.filter((r) => r.valid_from < m);
					expect(
						shown(budgetFor("c1", asked, [...earlier, set], [], "PKR")),
					).toBe(a === null ? null : parseMoney(a, "PKR").toString());
				},
			),
		);
	});

	it("takes the one written last when two devices set the same month", () => {
		const twice = (first: string, second: string) => [
			{
				category_id: "c1",
				valid_from: "2026-10",
				amount: first,
				created_at: "2026-10-02T00:00:00.000Z",
			},
			{
				category_id: "c1",
				valid_from: "2026-10",
				amount: second,
				created_at: "2026-10-03T00:00:00.000Z",
			},
		];
		expect(
			shown(budgetFor("c1", "2026-11", twice("100", "200"), [], "PKR")),
		).toBe("200");
		expect(
			shown(
				budgetFor(
					"c1",
					"2026-10",
					[],
					twice("100", "300").map(({ valid_from, ...rest }) => ({
						...rest,
						month: valid_from,
					})),
					"PKR",
				),
			),
		).toBe("300");
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
				fc.integer({ min: 0, max: 28 }),
				(used, budget, days, day) => {
					const result = pace(
						parseMoney(String(used), "PKR"),
						parseMoney(String(budget), "PKR"),
						day,
						days,
					);
					expect(result.percentUsed).toBe(Math.round((used * 100) / budget));
					expect(result.ahead).toBe(used * days > budget * day);
				},
			),
		);
	});

	it("compares the exact amounts, not the rounded percent", () => {
		const used = (amount: string, day: number) =>
			pace(parseMoney(amount, "PKR"), parseMoney("100", "PKR"), day, 30).ahead;
		expect(used("50.4", 15)).toBe(true);
		expect(used("6.6", 2)).toBe(false);
	});
});

describe("budgetMonthView", () => {
	const category = (
		id: string,
		name: string,
		more: Partial<CategoryLike> = {},
	): CategoryLike => ({
		id,
		name,
		kind: "expense",
		parent_id: null,
		archived_at: null,
		...more,
	});
	const at = "2026-10-01T00:00:00.000Z";
	const view = (month: string, today = "2026-10-12") =>
		budgetMonthView({
			month,
			today,
			startDay: 1,
			currency: "PKR",
			categories: [
				category("food", "Food"),
				category("groceries", "Groceries", { parent_id: "food" }),
				category("old", "Old", { archived_at: at }),
				category("salary", "Salary", { kind: "income" }),
			],
			standing: [
				{
					category_id: "food",
					valid_from: "2026-10",
					amount: "1000",
					created_at: at,
				},
				{
					category_id: "groceries",
					valid_from: "2026-10",
					amount: "800",
					created_at: at,
				},
				{
					category_id: "old",
					valid_from: "2026-01",
					amount: "50",
					created_at: at,
				},
				{
					category_id: "salary",
					valid_from: "2026-01",
					amount: "5000",
					created_at: at,
				},
			],
			overrides: [
				{
					category_id: "food",
					month: "2026-11",
					amount: "2000",
					created_at: at,
				},
			],
			entries: [
				{
					id: "e1",
					kind: "expense",
					amount: "-600",
					category_id: "groceries",
					occurred_on: "2026-10-03",
				},
				{
					id: "e2",
					kind: "balance_adjustment",
					amount: "-999",
					category_id: null,
					occurred_on: "2026-10-04",
				},
			],
			items: [],
		});

	it("lists each Budget in list order, archived Categories after, with what's used and whether it's overridden", () => {
		const october = view("2026-10");
		expect(
			october.budgets.map((l) => [
				l.category.id,
				l.budget.toString(),
				l.used.toString(),
				l.includesSubcategories,
			]),
		).toEqual([
			["food", "1000", "600", true],
			["groceries", "800", "600", false],
			["old", "50", "0", false],
		]);
		expect(october.expectedIncome.map((l) => l.category.id)).toEqual([
			"salary",
		]);
		expect(view("2026-11").budgets[0]?.overridden).toBe(true);
	});

	it("is as far through as today: its day this month, all of a past one, none of a future one", () => {
		fc.assert(
			fc.property(month, date, (m, today) => {
				const { day, days, current } = view(m, today);
				expect(day >= 0 && day <= days).toBe(true);
				expect(current).toBe(day >= 1 && budgetMonthOf(today, 1) === m);
			}),
		);
	});

	it("puts the most used first on Home, leaving out a Subcategory whose parent is shown", () => {
		expect(
			topBudgets(view("2026-10").budgets, 3).map((l) => l.category.id),
		).toEqual(["food", "old"]);
	});
});
