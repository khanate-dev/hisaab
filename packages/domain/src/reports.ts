import { baseValue } from "./base-amounts";
import {
	type BudgetMonth,
	budgetMonthOf,
	budgetMonthRange,
	type CountedEntry,
	type CountedItem,
	categoryTotals,
	shiftBudgetMonth,
} from "./budgets";
import type { CategoryLike } from "./categories";
import { isFlowKind } from "./entries";
import { addMoney, type Money, zeroMoney } from "./money";
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
