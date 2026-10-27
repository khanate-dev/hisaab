// Budgets (spec §3.3): a standing amount per Budget month for a Category, valid from a month onward until changed,
// with per-month overrides and no rollover. Expected income is the same thing for an income Category. A Budget month
// starts on the household's chosen day (1 to 28) and is named by the YYYY-MM it starts in.

import { type CategoryLike, categoryTree } from "./categories";
import { shiftCalendarDate } from "./dates";
import { isFlowKind, magnitude } from "./entries";
import {
	addMoney,
	isNegative,
	isZero,
	type Money,
	negateMoney,
	parseMoney,
	percentOf,
	timesMoney,
	zeroMoney,
} from "./money";

/** A Budget month, as the YYYY-MM it starts in. */
export type BudgetMonth = string;

const pad = (n: number) => String(n).padStart(2, "0");

/** The Budget month `count` months after (or, negative, before) another. */
export const shiftBudgetMonth = (
	month: BudgetMonth,
	count: number,
): BudgetMonth => {
	const [year, monthOfYear] = month.split("-").map(Number) as [number, number];
	const index = year * 12 + (monthOfYear - 1) + count;
	return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};

/** The Budget month a calendar date (YYYY-MM-DD) falls in. */
export const budgetMonthOf = (date: string, startDay: number): BudgetMonth => {
	const month = date.slice(0, 7);
	return Number(date.slice(8, 10)) >= startDay
		? month
		: shiftBudgetMonth(month, -1);
};

/** A Budget month's first and last calendar dates, both included. */
export const budgetMonthRange = (month: BudgetMonth, startDay: number) => {
	const first = `${month}-${pad(startDay)}`;
	const last = shiftCalendarDate(
		`${shiftBudgetMonth(month, 1)}-${pad(startDay)}`,
		-1,
	);
	return { first, last };
};

/** How many days a Budget month has. */
export const budgetMonthDays = (month: BudgetMonth, startDay: number) => {
	const { first, last } = budgetMonthRange(month, startDay);
	return Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
};

/** Which day of its Budget month a date is, from 1. */
export const dayOfBudgetMonth = (date: string, startDay: number) =>
	Math.round(
		(Date.parse(date) -
			Date.parse(
				budgetMonthRange(budgetMonthOf(date, startDay), startDay).first,
			)) /
			86_400_000,
	) + 1;

export type StandingBudget = {
	category_id: string;
	valid_from: BudgetMonth;
	/** Null stops the Budget from this month on. */
	amount: string | null;
	created_at: string;
};
export type BudgetOverride = {
	category_id: string;
	month: BudgetMonth;
	amount: string;
	created_at: string;
};

/** The one written last; ties (never expected) go to whichever came first in the list. */
const writtenLast = <T extends { created_at: string }>(rows: readonly T[]) =>
	rows.reduce<T | undefined>(
		(last, row) => (!last || row.created_at > last.created_at ? row : last),
		undefined,
	);

/**
 * A Category's Budget (or Expected income) for a Budget month: its override for that month, else the standing amount
 * valid from the latest month not after it; null when it has none. Two devices offline may each set the same month:
 * both rows sync, and the one written last wins.
 */
export const budgetFor = (
	categoryId: string,
	month: BudgetMonth,
	standing: readonly StandingBudget[],
	overrides: readonly BudgetOverride[],
	currency: string,
): Money | null => {
	const override = writtenLast(
		overrides.filter((o) => o.category_id === categoryId && o.month === month),
	);
	if (override) return parseMoney(override.amount, currency);
	const valid = standing.filter(
		(b) => b.category_id === categoryId && b.valid_from <= month,
	);
	const from = valid.reduce<BudgetMonth | undefined>(
		(latest, b) => (!latest || b.valid_from > latest ? b.valid_from : latest),
		undefined,
	);
	const current = writtenLast(valid.filter((b) => b.valid_from === from));
	return current?.amount != null ? parseMoney(current.amount, currency) : null;
};

/** Whether a Category's Budget for the month is a Budget override rather than the standing amount. */
export const isOverridden = (
	categoryId: string,
	month: BudgetMonth,
	overrides: readonly BudgetOverride[],
) => overrides.some((o) => o.category_id === categoryId && o.month === month);

export type CountedEntry = {
	id: string;
	kind: string;
	amount: string;
	category_id: string | null;
	occurred_on: string;
};
export type CountedItem = {
	entry_id: string;
	amount: string;
	category_id: string;
};

/**
 * What each Category spent (or received) over a range of dates, both included: Expenses and Incomes only, never a
 * Balance adjustment or a Transfer. An itemized Expense counts each Item against the Item's own Category. A parent's
 * total includes its Subcategories'. In the Base currency (until Base amounts, #45, every Entry is in it).
 */
export const categoryTotals = (
	entries: readonly CountedEntry[],
	items: readonly CountedItem[],
	parentOf: ReadonlyMap<string, string | null>,
	range: { first: string; last: string },
	currency: string,
): Map<string, Money> => {
	const totals = new Map<string, Money>();
	const add = (categoryId: string, amount: Money) => {
		for (
			let id: string | null | undefined = categoryId;
			id;
			id = parentOf.get(id)
		)
			totals.set(id, addMoney(totals.get(id) ?? zeroMoney(currency), amount));
	};
	const itemsOf = new Map<string, CountedItem[]>();
	for (const item of items)
		itemsOf.set(item.entry_id, [...(itemsOf.get(item.entry_id) ?? []), item]);
	for (const entry of entries) {
		if (
			!isFlowKind(entry.kind) ||
			entry.occurred_on < range.first ||
			entry.occurred_on > range.last
		)
			continue;
		const own = itemsOf.get(entry.id);
		if (own && own.length > 0)
			for (const item of own)
				add(item.category_id, magnitude(parseMoney(item.amount, currency)));
		else if (entry.category_id !== null)
			add(entry.category_id, magnitude(parseMoney(entry.amount, currency)));
	}
	return totals;
};

/** Pace (CONTEXT.md): how much of a Budget is used against how far through its month we are. */
export const pace = (
	used: Money,
	budget: Money,
	day: number,
	days: number,
) => ({
	day,
	days,
	/** Whole percent used, for showing; null when the Budget is zero. */
	percentUsed: percentOf(used, budget),
	/** Ahead of the month: a bigger share used than the share of the month gone, compared exactly. */
	ahead:
		!isZero(budget) &&
		isNegative(
			addMoney(timesMoney(budget, day), negateMoney(timesMoney(used, days))),
		),
});

/** One Category's Budget (or Expected income) in a Budget month, and how much of it is used. */
export type BudgetLine<T extends CategoryLike> = {
	category: T;
	budget: Money;
	/** Spent, for a Budget; received, for Expected income. Includes the Category's Subcategories. */
	used: Money;
	/** Whether the Category has Subcategories, whose spending its total includes. */
	includesSubcategories: boolean;
	/** Set only for this month, as a Budget override. */
	overridden: boolean;
	/** Whole percent of the Budget used; null when the Budget is zero. */
	percentUsed: number | null;
	/** More used than the share of the month gone. */
	ahead: boolean;
};

/** A Budget month as the Budgets tab shows it. */
export type BudgetMonthView<T extends CategoryLike> = {
	month: BudgetMonth;
	/** The Base currency, which Budgets are in. */
	currency: string;
	first: string;
	last: string;
	/** How far through it today is: its day for the current month, all of it for a past one, none for a future one. */
	day: number;
	days: number;
	current: boolean;
	/** Expense Categories with a Budget this month, in list order; archived ones after. */
	budgets: BudgetLine<T>[];
	/** Income Categories with Expected income this month, in list order; archived ones after. */
	expectedIncome: BudgetLine<T>[];
};

/** One list's Categories: the active ones in list order (each parent, then its Subcategories), then archived ones. */
const inListOrder = <T extends CategoryLike>(
	categories: readonly T[],
	kind: CategoryLike["kind"],
) => {
	const active = categoryTree(categories, kind).flatMap(
		({ category, subcategories }) => [category, ...subcategories],
	);
	const shown = new Set(active.map((c) => c.id));
	return [
		...active,
		...categories
			.filter((c) => c.kind === kind && !shown.has(c.id))
			.toSorted((a, b) => a.name.localeCompare(b.name)),
	];
};

/** A Budget month of a household: every Budget and Expected income in it, how much of each is used, and its Pace. */
export const budgetMonthView = <T extends CategoryLike>({
	month,
	today,
	startDay,
	currency,
	categories,
	standing,
	overrides,
	entries,
	items,
}: {
	month: BudgetMonth;
	today: string;
	startDay: number;
	/** The Base currency: Budgets, and every Expense and Income until Base amounts (#45), are in it. */
	currency: string;
	categories: readonly T[];
	standing: readonly StandingBudget[];
	overrides: readonly BudgetOverride[];
	entries: readonly CountedEntry[];
	items: readonly CountedItem[];
}): BudgetMonthView<T> => {
	const range = budgetMonthRange(month, startDay);
	const days = budgetMonthDays(month, startDay);
	const thisMonth = budgetMonthOf(today, startDay);
	const day =
		month === thisMonth
			? dayOfBudgetMonth(today, startDay)
			: month < thisMonth
				? days
				: 0;
	const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
	const parents = new Set(categories.map((c) => c.parent_id));
	const totals = categoryTotals(entries, items, parentOf, range, currency);
	const lines = (kind: CategoryLike["kind"]) =>
		inListOrder(categories, kind).flatMap((category): BudgetLine<T>[] => {
			const budget = budgetFor(
				category.id,
				month,
				standing,
				overrides,
				currency,
			);
			if (!budget) return [];
			const used = totals.get(category.id) ?? zeroMoney(currency);
			const { percentUsed, ahead } = pace(used, budget, day, days);
			return [
				{
					category,
					budget,
					used,
					includesSubcategories: parents.has(category.id),
					overridden: isOverridden(category.id, month, overrides),
					percentUsed,
					ahead,
				},
			];
		});
	return {
		month,
		currency,
		...range,
		day,
		days,
		current: month === thisMonth,
		budgets: lines("expense"),
		expectedIncome: lines("income"),
	};
};

/**
 * Home's top Budgets: the most used first. A Subcategory's Budget is left out when its parent's is shown, as the
 * parent's already counts its spending.
 */
export const topBudgets = <T extends CategoryLike>(
	lines: readonly BudgetLine<T>[],
	count: number,
) => {
	const budgeted = new Set(lines.map((l) => l.category.id));
	return lines
		.filter(
			(l) =>
				l.category.parent_id === null || !budgeted.has(l.category.parent_id),
		)
		.toSorted((a, b) => (b.percentUsed ?? -1) - (a.percentUsed ?? -1))
		.slice(0, count);
};
