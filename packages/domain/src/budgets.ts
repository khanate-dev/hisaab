// Budgets (spec §3.3): a standing amount per Budget month for a Category, valid from a month onward until changed,
// with per-month overrides and no rollover. Expected income is the same thing for an income Category. A Budget month
// starts on the household's chosen day (1 to 28) and is named by the YYYY-MM it starts in.

import { isFlowKind, magnitude } from "./entries";
import {
	addMoney,
	type Money,
	parseMoney,
	percentOf,
	zeroMoney,
} from "./money";
import { shiftCalendarDate } from "./dates";

/** A Budget month, as the YYYY-MM it starts in. */
export type BudgetMonth = string;

const BUDGET_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isBudgetMonth = (text: string) => BUDGET_MONTH.test(text);

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
	amount: string;
};
export type BudgetOverride = {
	category_id: string;
	month: BudgetMonth;
	amount: string;
};

/**
 * A Category's Budget (or Expected income) for a Budget month: its override for that month, else the standing amount
 * valid from the latest month not after it; null when it has none.
 */
export const budgetFor = (
	categoryId: string,
	month: BudgetMonth,
	standing: readonly StandingBudget[],
	overrides: readonly BudgetOverride[],
	currency: string,
): Money | null => {
	const override = overrides.find(
		(o) => o.category_id === categoryId && o.month === month,
	);
	if (override) return parseMoney(override.amount, currency);
	const current = standing
		.filter((b) => b.category_id === categoryId && b.valid_from <= month)
		.toSorted((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
	return current ? parseMoney(current.amount, currency) : null;
};

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
	/** Null when the Budget is zero. */
	percentUsed: percentOf(used, budget),
	/** Ahead of the month: more used than the share of the month gone. */
	ahead: (() => {
		const percent = percentOf(used, budget);
		return percent !== null && percent * days > 100 * day;
	})(),
});
