import { baseValue } from "./base-amounts";
import {
	type BudgetMonth,
	type BudgetOverride,
	budgetFor,
	budgetMonthOf,
	budgetMonthRange,
	type CountedEntry,
	type CountedItem,
	categoryTotals,
	pace,
	type StandingBudget,
	shiftBudgetMonth,
} from "./budgets";
import type { CategoryLike } from "./categories";
import { isFlowKind, magnitude } from "./entries";
import { addMoney, type Money, negateMoney, zeroMoney } from "./money";
import { type EntryFilter, NO_FILTER } from "./search";

// Reports (spec §3.5; #50): computed on the device from synced Entries, in the household's Base currency (each Entry
// at its Base value, ADR-0005). Every report excludes Balance adjustments (and Pending Occurrences, which aren't
// Entries), filters by who recorded, ranges over whole Budget months and compares with the previous period and the
// 3-month average.

/** The range presets, in Budget months ending with the current one (or, for last month, the one before). */
export const REPORT_PRESETS = [
	"this_month",
	"last_month",
	"last_3_months",
	"last_6_months",
	"last_12_months",
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** A report's range: whole Budget months, oldest first, and the dates they span (both included). */
export type ReportPeriod = {
	months: BudgetMonth[];
	first: string;
	last: string;
};

/** `count` Budget months ending with `lastMonth`. */
export const periodEnding = (
	lastMonth: BudgetMonth,
	count: number,
	startDay: number,
): ReportPeriod => {
	const months = Array.from({ length: count }, (_, i) =>
		shiftBudgetMonth(lastMonth, i - count + 1),
	);
	return {
		months,
		first: budgetMonthRange(months[0] ?? lastMonth, startDay).first,
		last: budgetMonthRange(lastMonth, startDay).last,
	};
};

/** A preset's period, from today's Budget month. */
export const reportPeriod = (
	preset: ReportPreset,
	today: string,
	startDay: number,
): ReportPeriod => {
	const month = budgetMonthOf(today, startDay);
	switch (preset) {
		case "this_month":
			return periodEnding(month, 1, startDay);
		case "last_month":
			return periodEnding(shiftBudgetMonth(month, -1), 1, startDay);
		case "last_3_months":
			return periodEnding(month, 3, startDay);
		case "last_6_months":
			return periodEnding(month, 6, startDay);
		case "last_12_months":
			return periodEnding(month, 12, startDay);
	}
};

/** The same number of Budget months right before a period: what "vs previous period" compares with. */
export const previousPeriod = (
	period: ReportPeriod,
	startDay: number,
): ReportPeriod =>
	periodEnding(
		shiftBudgetMonth(period.months[0] ?? "", -1),
		period.months.length,
		startDay,
	);

/** The three Budget months right before a period: what "vs the 3-month average" averages. */
export const averageBasis = (period: ReportPeriod, startDay: number) =>
	periodEnding(shiftBudgetMonth(period.months[0] ?? "", -1), 3, startDay);

/** An Entry as reports read it: what Budgets count, and who recorded it. */
export type ReportEntry = CountedEntry & { created_by: string };

/** Entries recorded by these members; everyone's when none are picked. */
export const byMembers = <T extends { created_by: string }>(
	entries: readonly T[],
	members: readonly string[],
) =>
	members.length === 0
		? entries
		: entries.filter((entry) => members.includes(entry.created_by));

/** One top-level Expense Category's spending, its Subcategories', and what it's compared with. */
export type SpendingLine<T extends CategoryLike> = {
	category: T;
	/** Includes its Subcategories'. */
	amount: Money;
	previous: Money;
	/** The 3-month average, scaled to the period's length: what the period would come to at that pace. */
	average: Money;
	subcategories: { category: T; amount: Money }[];
};

export type SpendingByCategory<T extends CategoryLike> = {
	period: ReportPeriod;
	currency: string;
	total: Money;
	previousTotal: Money;
	averageTotal: Money;
	/** Top-level Expense Categories spent in (now, before or on average), the most spent first. */
	lines: SpendingLine<T>[];
	/** Expenses in the period without a Base amount yet (no rate held), counted nowhere until priced. */
	unpriced: number;
};

/**
 * Spending by category (spec §3.5): each top-level Expense Category's spending over the period, Subcategories
 * included and broken out, itemized Expenses counted by Item, with the previous period's and the 3-month average.
 */
export const spendingByCategory = <T extends CategoryLike>({
	entries,
	items,
	categories,
	members,
	period,
	startDay,
	currency,
}: {
	entries: readonly ReportEntry[];
	items: readonly CountedItem[];
	categories: readonly T[];
	members: readonly string[];
	period: ReportPeriod;
	startDay: number;
	currency: string;
}): SpendingByCategory<T> => {
	const mine = byMembers(entries, members).filter(
		(entry) => entry.kind === "expense",
	);
	const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
	const totals = (range: ReportPeriod) =>
		categoryTotals(mine, items, parentOf, range, currency);
	const now = totals(period);
	const before = totals(previousPeriod(period, startDay));
	const basis = totals(averageBasis(period, startDay));
	const zero = zeroMoney(currency);
	const average = (id: string) =>
		(basis.get(id) ?? zero).times(period.months.length).dividedInto(3);

	const expense = categories.filter((c) => c.kind === "expense");
	const lines = expense
		.filter((c) => c.parent_id === null)
		.map((category): SpendingLine<T> => ({
			category,
			amount: now.get(category.id) ?? zero,
			previous: before.get(category.id) ?? zero,
			average: average(category.id),
			subcategories: expense
				.filter((sub) => sub.parent_id === category.id)
				.map((sub) => ({ category: sub, amount: now.get(sub.id) ?? zero }))
				.filter((sub) => !sub.amount.isZero())
				.toSorted((a, b) => b.amount.compare(a.amount)),
		}))
		.filter(
			(line) =>
				!line.amount.isZero() ||
				!line.previous.isZero() ||
				!line.average.isZero(),
		)
		.toSorted((a, b) => b.amount.compare(a.amount));
	const sum = (pick: (line: SpendingLine<T>) => Money) =>
		lines.map(pick).reduce(addMoney, zero);

	return {
		period,
		currency,
		total: sum((l) => l.amount),
		previousTotal: sum((l) => l.previous),
		averageTotal: sum((l) => l.average),
		lines,
		unpriced: mine.filter(
			(entry) =>
				isFlowKind(entry.kind) &&
				entry.occurred_on >= period.first &&
				entry.occurred_on <= period.last &&
				baseValue(entry, currency) === null,
		).length,
	};
};

/**
 * Where a report's number drills down to (spec §3.5): the Entries list filtered to the period, the kinds counted, the
 * members picked and, for one Category's figure, that Category (its Subcategories and Items match with it).
 */
export const drillDown = ({
	period,
	kinds,
	members,
	categoryId,
}: {
	period: ReportPeriod;
	kinds: readonly string[];
	members: readonly string[];
	categoryId?: string;
}): EntryFilter => ({
	...NO_FILTER,
	kinds,
	memberIds: members,
	categoryIds: categoryId === undefined ? [] : [categoryId],
	from: period.first,
	to: period.last,
});

/** Each Budget month of a period as a range of its own. */
const monthsOf = (period: ReportPeriod, startDay: number) =>
	period.months.map((month) => ({
		month,
		...budgetMonthRange(month, startDay),
	}));

/** How far through a period today is, in days: none before it, all of it after it (as Pace reads it). */
const progress = (period: ReportPeriod, today: string) => {
	const days =
		Math.round(
			(Date.parse(period.last) - Date.parse(period.first)) / 86_400_000,
		) + 1;
	if (today < period.first) return { day: 0, days };
	if (today > period.last) return { day: days, days };
	return {
		day:
			Math.round((Date.parse(today) - Date.parse(period.first)) / 86_400_000) +
			1,
		days,
	};
};

/** One budgeted Expense Category over a period: its Budgets added up against what was spent, and its Pace. */
export type BudgetVsActualLine<T extends CategoryLike> = {
	category: T;
	/** Each Budget month's Budget, added up. */
	budget: Money;
	/** Includes its Subcategories'. */
	actual: Money;
	previous: Money;
	average: Money;
	/** Whole percent of the Budget spent; null when it's zero. */
	percentUsed: number | null;
	/** More spent than the share of the period gone (Pace). */
	ahead: boolean;
};

/**
 * Budget vs actual (spec §3.5): every Expense Category with a Budget in any of the period's months, its Budgets added
 * up against what was spent, with Pace through the period and both comparisons on what was spent.
 */
export const budgetVsActual = <T extends CategoryLike>({
	entries,
	items,
	categories,
	members,
	period,
	startDay,
	currency,
	standing,
	overrides,
	today,
}: {
	entries: readonly ReportEntry[];
	items: readonly CountedItem[];
	categories: readonly T[];
	members: readonly string[];
	period: ReportPeriod;
	startDay: number;
	currency: string;
	standing: readonly StandingBudget[];
	overrides: readonly BudgetOverride[];
	today: string;
}) => {
	const spending = spendingByCategory({
		entries,
		items,
		categories,
		members,
		period,
		startDay,
		currency,
	});
	const mine = byMembers(entries, members).filter((e) => e.kind === "expense");
	const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
	const totals = (range: ReportPeriod) =>
		categoryTotals(mine, items, parentOf, range, currency);
	const now = totals(period);
	const before = totals(previousPeriod(period, startDay));
	const basis = totals(averageBasis(period, startDay));
	const zero = zeroMoney(currency);
	const { day, days } = progress(period, today);
	const lines = categories
		.filter((c) => c.kind === "expense")
		.flatMap((category): BudgetVsActualLine<T>[] => {
			const monthly = period.months.map((month) =>
				budgetFor(category.id, month, standing, overrides, currency),
			);
			if (monthly.every((b) => b === null)) return [];
			const budget = monthly.reduce<Money>(
				(sum, b) => addMoney(sum, b ?? zero),
				zero,
			);
			const actual = now.get(category.id) ?? zero;
			const { percentUsed, ahead } = pace(actual, budget, day, days);
			return [
				{
					category,
					budget,
					actual,
					previous: before.get(category.id) ?? zero,
					average: (basis.get(category.id) ?? zero)
						.times(period.months.length)
						.dividedInto(3),
					percentUsed,
					ahead,
				},
			];
		});
	return { period, currency, day, days, lines, unpriced: spending.unpriced };
};

/** What came in and went out in one Budget month. */
export type FlowMonth = {
	month: BudgetMonth;
	income: Money;
	expense: Money;
	net: Money;
};

/** Expenses and Incomes over a range, each at its Base value; one without a Base amount yet counts nowhere. */
const flows = (
	entries: readonly ReportEntry[],
	range: { first: string; last: string },
	currency: string,
) => {
	let income = zeroMoney(currency);
	let expense = zeroMoney(currency);
	for (const entry of entries) {
		if (entry.occurred_on < range.first || entry.occurred_on > range.last)
			continue;
		if (entry.kind !== "income" && entry.kind !== "expense") continue;
		const value = baseValue(entry, currency);
		if (value === null) continue;
		if (entry.kind === "income") income = addMoney(income, magnitude(value));
		else expense = addMoney(expense, magnitude(value));
	}
	return { income, expense, net: addMoney(income, negateMoney(expense)) };
};

/**
 * Income vs expense (spec §3.5): each Budget month's Incomes and Expenses and what was left, the period's totals, and
 * both comparisons on the totals.
 */
export const incomeVsExpense = ({
	entries,
	members,
	period,
	startDay,
	currency,
}: {
	entries: readonly ReportEntry[];
	members: readonly string[];
	period: ReportPeriod;
	startDay: number;
	currency: string;
}) => {
	const mine = byMembers(entries, members);
	const months: FlowMonth[] = monthsOf(period, startDay).map((range) => ({
		month: range.month,
		...flows(mine, range, currency),
	}));
	const total = flows(mine, period, currency);
	const previous = flows(mine, previousPeriod(period, startDay), currency);
	const basis = flows(mine, averageBasis(period, startDay), currency);
	const scale = (m: Money) => m.times(period.months.length).dividedInto(3);
	return {
		period,
		currency,
		months,
		total,
		previous,
		average: {
			income: scale(basis.income),
			expense: scale(basis.expense),
			net: scale(basis.net),
		},
	};
};

/**
 * Category trend (spec §3.5): one Category, Subcategories included, Budget month by Budget month over the period, with
 * both comparisons on its total.
 */
export const categoryTrend = <T extends CategoryLike>({
	category,
	entries,
	items,
	categories,
	members,
	period,
	startDay,
	currency,
}: {
	category: T;
	entries: readonly ReportEntry[];
	items: readonly CountedItem[];
	categories: readonly T[];
	members: readonly string[];
	period: ReportPeriod;
	startDay: number;
	currency: string;
}) => {
	const mine = byMembers(entries, members).filter(
		(e) => e.kind === category.kind,
	);
	const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
	const zero = zeroMoney(currency);
	const of = (range: { first: string; last: string }) =>
		categoryTotals(mine, items, parentOf, range, currency).get(category.id) ??
		zero;
	const months = monthsOf(period, startDay).map((range) => ({
		month: range.month,
		amount: of(range),
	}));
	return {
		period,
		currency,
		category,
		months,
		total: of(period),
		previous: of(previousPeriod(period, startDay)),
		average: of(averageBasis(period, startDay))
			.times(period.months.length)
			.dividedInto(3),
	};
};
