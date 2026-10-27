import {
	budgetFor,
	type BudgetMonth,
	budgetMonthDays,
	budgetMonthOf,
	budgetMonthRange,
	type BudgetOverride,
	categoryTotals,
	categoryTree,
	type CountedEntry,
	type CountedItem,
	dayOfBudgetMonth,
	type Money,
	pace,
	type StandingBudget,
	zeroMoney,
} from "@hisaab/domain";

import type { Category } from "@/features/categories/types";

/** One Category's Budget (or Expected income) in a Budget month, and how much of it is used. */
export type BudgetLine = {
	category: Category;
	budget: Money;
	/** Spent, for a Budget; received, for Expected income. */
	used: Money;
	/** Whole percent of the Budget used; null when the Budget is zero. */
	percentUsed: number | null;
	/** More used than the share of the month gone. */
	ahead: boolean;
};

/** A Budget month as the Budgets tab shows it. */
export type BudgetMonthView = {
	month: BudgetMonth;
	/** The Base currency, which Budgets are in. */
	currency: string;
	first: string;
	last: string;
	/** How far through it today is: its day for the current month, all of it for a past one, none for a future one. */
	day: number;
	days: number;
	current: boolean;
	/** Expense Categories with a Budget this month, in list order. */
	budgets: BudgetLine[];
	/** Income Categories with Expected income this month, in list order. */
	expectedIncome: BudgetLine[];
};

type Sources = {
	month: BudgetMonth;
	today: string;
	startDay: number;
	/** The Base currency: Budgets, and every Expense and Income until Base amounts (#45), are in it. */
	currency: string;
	categories: readonly Category[];
	standing: readonly StandingBudget[];
	overrides: readonly BudgetOverride[];
	entries: readonly CountedEntry[];
	items: readonly CountedItem[];
};

export const EXPENSE: Category["kind"] = "expense";
export const INCOME: Category["kind"] = "income";

/** Every active Category of one list in list order: each parent, then its Subcategories. */
const inListOrder = (categories: readonly Category[], kind: Category["kind"]) =>
	categoryTree(categories, kind).flatMap(({ category, subcategories }) => [
		category,
		...subcategories,
	]);

/** The Budget month the household is in today. */
export const currentBudgetMonth = (today: string, startDay: number) =>
	budgetMonthOf(today, startDay);

export const budgetMonthView = ({
	month,
	today,
	startDay,
	currency,
	categories,
	standing,
	overrides,
	entries,
	items,
}: Sources): BudgetMonthView => {
	const range = budgetMonthRange(month, startDay);
	const days = budgetMonthDays(month, startDay);
	const thisMonth = currentBudgetMonth(today, startDay);
	const day =
		month === thisMonth
			? dayOfBudgetMonth(today, startDay)
			: month < thisMonth
				? days
				: 0;
	const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
	const totals = categoryTotals(entries, items, parentOf, range, currency);
	const lines = (kind: Category["kind"]) =>
		inListOrder(categories, kind).flatMap((category): BudgetLine[] => {
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
			return [{ category, budget, used, percentUsed, ahead }];
		});
	return {
		month,
		currency,
		...range,
		day,
		days,
		current: month === thisMonth,
		budgets: lines(EXPENSE),
		expectedIncome: lines(INCOME),
	};
};

/** Home's top Budgets: the most used this month first. */
export const topBudgets = (lines: readonly BudgetLine[], count: number) =>
	lines
		.toSorted((a, b) => (b.percentUsed ?? -1) - (a.percentUsed ?? -1))
		.slice(0, count);
