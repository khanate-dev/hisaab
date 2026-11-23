import Decimal from "decimal.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { budgetMonthOf, budgetMonthRange, shiftBudgetMonth } from "./budgets";
import type { CategoryLike } from "./categories";
import { shiftCalendarDate } from "./dates";
import { currencyDecimals, parseMoney, sumMoney } from "./money";
import {
	averageBasis,
	drillDown,
	periodEnding,
	previousPeriod,
	REPORT_PRESETS,
	type ReportEntry,
	reportPeriod,
	spendingByCategory,
} from "./reports";
import { matchesFilter, readSavedCriteria, writeSavedCriteria } from "./search";

const category = (
	id: string,
	parent: string | null = null,
	kind: CategoryLike["kind"] = "expense",
): CategoryLike => ({
	id,
	kind,
	parent_id: parent,
	name: id,
	archived_at: null,
});
const categories = [
	category("food"),
	category("snacks", "food"),
	category("fuel"),
	category("salary", null, "income"),
];

const day = fc
	.integer({ min: 0, max: 200 })
	.map((n) => shiftCalendarDate("2026-05-01", n));
const entry = fc.record({
	id: fc.uuid(),
	kind: fc.constantFrom(
		"expense",
		"expense",
		"income",
		"balance_adjustment",
		"transfer",
	),
	cents: fc.integer({ min: 1, max: 1_000_000 }),
	category: fc.constantFrom("food", "snacks", "fuel", "salary"),
	occurred_on: day,
	created_by: fc.constantFrom("u1", "u2", "u3"),
});
const entries = fc
	.uniqueArray(entry, { selector: (e) => e.id, maxLength: 30 })
	.map((list) =>
		list.map((e): ReportEntry => ({
			id: e.id,
			kind: e.kind,
			amount: `${e.kind === "expense" || e.kind === "transfer" ? "-" : ""}${(e.cents / 100).toFixed(2)}`,
			category_id:
				e.kind === "expense"
					? e.category === "salary"
						? "food"
						: e.category
					: e.kind === "income"
						? "salary"
						: null,
			occurred_on: e.occurred_on,
			created_by: e.created_by,
		})),
	);

describe("report periods", () => {
	it("cover whole Budget months, back to back with the previous period and the average's basis", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...REPORT_PRESETS),
				day,
				fc.integer({ min: 1, max: 28 }),
				(preset, today, startDay) => {
					const period = reportPeriod(preset, today, startDay);
					const before = previousPeriod(period, startDay);
					const basis = averageBasis(period, startDay);
					expect(before.months).toHaveLength(period.months.length);
					expect(basis.months).toHaveLength(3);
					for (const earlier of [before, basis])
						expect(shiftCalendarDate(earlier.last, 1)).toBe(period.first);
					expect(period.first).toBe(
						budgetMonthRange(period.months[0] ?? "", startDay).first,
					);
					const current = budgetMonthOf(today, startDay);
					expect(period.months.at(-1)).toBe(
						preset === "last_month" ? shiftBudgetMonth(current, -1) : current,
					);
				},
			),
		);
	});
});

describe("Money.dividedInto", () => {
	it("is within half a minor unit of the exact share, and n of it come back within n half-units", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: -10_000_000, max: 10_000_000 }),
				fc.integer({ min: 1, max: 12 }),
				fc.constantFrom("PKR", "JPY", "KWD"),
				(units, count, code) => {
					const decimals = currencyDecimals(code);
					const amount = parseMoney(
						(units / 10 ** decimals).toFixed(decimals),
						code,
					);
					const back = new Decimal(amount.dividedInto(count).toString()).times(
						count,
					);
					// Within count half-units: the rounding of each share, added up.
					expect(
						back
							.minus(amount.toString())
							.abs()
							.lte(new Decimal(10).pow(-decimals).times(count).dividedBy(2)),
					).toBe(true);
				},
			),
		);
	});
});

describe("drillDown", () => {
	it("goes to the Entries list and back unchanged, as a Saved filter's criteria", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...REPORT_PRESETS),
				day,
				fc.array(fc.constantFrom("u1", "u2"), { maxLength: 2 }),
				fc.option(fc.constantFrom("food", "fuel"), { nil: undefined }),
				(preset, today, members, categoryId) => {
					const filter = drillDown({
						period: reportPeriod(preset, today, 1),
						kinds: ["expense"],
						members,
						...(categoryId !== undefined && { categoryId }),
					});
					expect(readSavedCriteria(writeSavedCriteria(filter))).toEqual(filter);
				},
			),
		);
	});
});

describe("spendingByCategory", () => {
	const period = periodEnding("2026-08", 3, 1);

	it("adds up to what in-range Expenses came to, never a Balance adjustment, Transfer or Income", () => {
		fc.assert(
			fc.property(entries, (list) => {
				const report = spendingByCategory({
					entries: list,
					items: [],
					categories,
					members: [],
					period,
					startDay: 1,
					currency: "PKR",
				});
				const spent = list.filter(
					(e) =>
						e.kind === "expense" &&
						e.occurred_on >= period.first &&
						e.occurred_on <= period.last,
				);
				expect(report.total.toString()).toBe(
					sumMoney(
						spent.map((e) => parseMoney(e.amount.slice(1), "PKR")),
						"PKR",
					).toString(),
				);
				expect(report.total.toString()).toBe(
					sumMoney(
						report.lines.map((l) => l.amount),
						"PKR",
					).toString(),
				);
				expect(report.lines.every((l) => l.category.kind === "expense")).toBe(
					true,
				);
			}),
		);
	});

	it("splits by who recorded: the members' reports add up to everyone's", () => {
		fc.assert(
			fc.property(entries, (list) => {
				const total = (members: string[]) =>
					spendingByCategory({
						entries: list,
						items: [],
						categories,
						members,
						period,
						startDay: 1,
						currency: "PKR",
					}).total;
				expect(
					sumMoney([total(["u1"]), total(["u2", "u3"])], "PKR").toString(),
				).toBe(total([]).toString());
			}),
		);
	});

	it("compares with the previous period and the 3-month average at the period's length", () => {
		const at = (date: string, amount: string, cat = "food") => ({
			id: `${date}${amount}${cat}`,
			kind: "expense",
			amount: `-${amount}`,
			category_id: cat,
			occurred_on: date,
			created_by: "u1",
		});
		const report = spendingByCategory({
			entries: [
				at("2026-08-10", "300", "snacks"),
				at("2026-07-10", "100"),
				at("2026-04-10", "30"),
				at("2026-03-10", "60"),
				at("2026-02-10", "10"),
			],
			items: [],
			categories,
			members: [],
			period: periodEnding("2026-08", 1, 1),
			startDay: 1,
			currency: "PKR",
		});
		const [food] = report.lines;
		expect(food?.category.id).toBe("food");
		expect(food?.amount.toString()).toBe("300");
		expect(food?.previous.toString()).toBe("100");
		expect(food?.subcategories.map((s) => s.category.id)).toEqual(["snacks"]);
		// May, June and July: 0 + 0 + 100, a third of it a month.
		expect(food?.average.toString()).toBe("33.33");
	});

	it("drills down to exactly the Entries a Category's figure counts", () => {
		fc.assert(
			fc.property(entries, fc.constantFrom("food", "fuel"), (list, id) => {
				const filter = drillDown({
					period,
					kinds: ["expense"],
					members: ["u1"],
					categoryId: id,
				});
				const shown = list.filter((e) =>
					matchesFilter(
						{
							kind: e.kind,
							walletIds: [],
							categoryIds:
								e.category_id === "snacks"
									? ["snacks", "food"]
									: e.category_id === null
										? []
										: [e.category_id],
							currencies: [],
							contactIds: [],
							createdBy: e.created_by,
							occurredOn: e.occurred_on,
							text: [],
							amounts: [],
						},
						filter,
					),
				);
				const report = spendingByCategory({
					entries: list,
					items: [],
					categories,
					members: ["u1"],
					period,
					startDay: 1,
					currency: "PKR",
				});
				const figure =
					report.lines.find((l) => l.category.id === id)?.amount.toString() ??
					"0";
				expect(
					sumMoney(
						shown.map((e) => parseMoney(e.amount.slice(1), "PKR")),
						"PKR",
					).toString(),
				).toBe(figure);
			}),
		);
	});
});
