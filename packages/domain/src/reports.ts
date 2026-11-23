import { baseValue, convertAt, type RateRow } from "./base-amounts";
import { walletBalances, type WalletEntry } from "./balances";
import {
	type BudgetMonth,
	type BudgetOverride,
	budgetFor,
	budgetMonthOf,
	budgetMonthRange,
	type CountedEntry,
	inListOrder,
	type CountedItem,
	categoryTotals,
	pace,
	type StandingBudget,
	shiftBudgetMonth,
} from "./budgets";
import type { CategoryLike } from "./categories";
import { calendarDateIn } from "./dates";
import { isFlowKind, magnitude } from "./entries";
import { isSettled, type LoanDirection, loanOutstanding } from "./loans";
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
		unpriced: unpricedIn(mine, period, currency),
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

/** One budgeted Category over a period: its Budgets added up against what was spent (or received), and its Pace. */
export type BudgetVsActualLine<T extends CategoryLike> = {
	category: T;
	/** The Budget months of the period it had a Budget (or Expected income) in; it's counted over those only. */
	months: BudgetMonth[];
	/** Each of those months' Budgets, added up. */
	budget: Money;
	/** Spent (or received) in those months, Subcategories' included. */
	actual: Money;
	/** The same months a period earlier. */
	previous: Money;
	/** The 3-month average, scaled to those months. */
	average: Money;
	/** Whole percent of the Budget used; null when it's zero. */
	percentUsed: number | null;
	/** More used than the share of those months gone (Pace). */
	ahead: boolean;
};

/** Expenses and Incomes over a range not priced yet: no Base amount, so counted nowhere until they are. */
const unpricedIn = (
	entries: readonly ReportEntry[],
	range: { first: string; last: string },
	currency: string,
) =>
	entries.filter(
		(entry) =>
			isFlowKind(entry.kind) &&
			entry.occurred_on >= range.first &&
			entry.occurred_on <= range.last &&
			baseValue(entry, currency) === null,
	).length;

/**
 * Budget vs actual (spec §3.5): every Category with a Budget (or Expected income) in any of the period's months, in
 * list order, its Budgets added up against what was spent (or received) in those same months, with Pace through them
 * up to today and both comparisons. A month without a Budget isn't counted against one.
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
	const mine = byMembers(entries, members);
	const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
	const zero = zeroMoney(currency);
	const totalsIn = new Map<string, Map<string, Money>>();
	const totals = (month: BudgetMonth) => {
		const cached = totalsIn.get(month);
		if (cached) return cached;
		const found = categoryTotals(
			mine,
			items,
			parentOf,
			budgetMonthRange(month, startDay),
			currency,
		);
		totalsIn.set(month, found);
		return found;
	};
	const add = (months: readonly BudgetMonth[], categoryId: string) =>
		months.reduce<Money>(
			(sum, month) => addMoney(sum, totals(month).get(categoryId) ?? zero),
			zero,
		);
	const back = (month: BudgetMonth, by: number) => shiftBudgetMonth(month, -by);
	const lines = (kind: CategoryLike["kind"]) =>
		inListOrder(categories, kind).flatMap(
			(category): BudgetVsActualLine<T>[] => {
				const months = period.months.filter(
					(month) =>
						budgetFor(category.id, month, standing, overrides, currency) !==
						null,
				);
				if (months.length === 0) return [];
				const budget = months.reduce<Money>(
					(sum, month) =>
						addMoney(
							sum,
							budgetFor(category.id, month, standing, overrides, currency) ??
								zero,
						),
					zero,
				);
				const actual = add(months, category.id);
				const progressed = months.map((month) =>
					progress(
						{ months: [month], ...budgetMonthRange(month, startDay) },
						today,
					),
				);
				const day = progressed.reduce((sum, p) => sum + p.day, 0);
				const days = progressed.reduce((sum, p) => sum + p.days, 0);
				const { percentUsed, ahead } = pace(actual, budget, day, days);
				const basis = [1, 2, 3].map((by) => back(months[0] ?? "", by));
				return [
					{
						category,
						months,
						budget,
						actual,
						previous: add(
							months.map((month) => back(month, period.months.length)),
							category.id,
						),
						average: add(basis, category.id)
							.times(months.length)
							.dividedInto(3),
						percentUsed,
						ahead,
					},
				];
			},
		);
	const { day, days } = progress(period, today);
	return {
		period,
		currency,
		day,
		days,
		/** Whether today falls inside the period, so Pace means how it's going. */
		current: today >= period.first && today <= period.last,
		budgets: lines("expense"),
		expectedIncome: lines("income"),
		unpriced: unpricedIn(mine, period, currency),
	};
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
		unpriced: unpricedIn(mine, period, currency),
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
		unpriced: unpricedIn(mine, period, currency),
		months,
		total: of(period),
		previous: of(previousPeriod(period, startDay)),
		average: of(averageBasis(period, startDay))
			.times(period.months.length)
			.dividedInto(3),
	};
};

/** A Wallet's Balance as of a date, and its value in the Base currency at the latest rates (null without a rate). */
export type WalletWorth<W> = { wallet: W; balance: Money; value: Money | null };

/** The earlier of two dates. */
const until = (date: string, today: string) => (date < today ? date : today);

/**
 * Net worth (spec §3.5; CONTEXT.md): every Wallet's Balance (ADR-0002) at the end of the period, or today while it
 * runs, each converted to the Base currency at the latest rates held (not each Entry's Base amount: worth is what it's
 * worth now), credit cards counting against it. Month by month, against the previous period's end and the average
 * of the three month-ends before. The members filter keeps only the Entries they recorded.
 */
export const netWorth = <W extends { id: string; currency: string }>({
	wallets,
	entries,
	members,
	period,
	startDay,
	currency,
	rates,
	today,
}: {
	wallets: readonly W[];
	entries: readonly (ReportEntry & WalletEntry)[];
	members: readonly string[];
	period: ReportPeriod;
	startDay: number;
	currency: string;
	rates: readonly RateRow[];
	today: string;
}) => {
	const mine = byMembers(entries, members);
	const zero = zeroMoney(currency);
	const asOf = (date: string) => {
		const balances = walletBalances(
			wallets,
			mine.filter((entry) => entry.occurred_on <= date),
		);
		const worth = wallets.map((wallet): WalletWorth<W> => {
			const balance = balances.get(wallet.id) ?? zeroMoney(wallet.currency);
			const value =
				wallet.currency === currency
					? balance
					: (convertAt(balance, currency, today, rates)?.amount ?? null);
			return { wallet, balance, value };
		});
		return {
			total: worth.reduce<Money>(
				(sum, w) => addMoney(sum, w.value ?? zero),
				zero,
			),
			wallets: worth,
			/** Wallets with a Balance but no rate held for their currency: left out of the total. */
			unconverted: worth.filter((w) => w.value === null && !w.balance.isZero())
				.length,
		};
	};
	const end = asOf(until(period.last, today));
	const basis = averageBasis(period, startDay);
	return {
		period,
		currency,
		...end,
		months: monthsOf(period, startDay)
			.filter((range) => range.first <= today)
			.map((range) => ({
				month: range.month,
				total: asOf(until(range.last, today)).total,
			})),
		previous: asOf(until(previousPeriod(period, startDay).last, today)).total,
		average: basis.months
			.map(
				(month) =>
					asOf(until(budgetMonthRange(month, startDay).last, today)).total,
			)
			.reduce<Money>(addMoney, zero)
			.dividedInto(3),
	};
};

/** A Loan outstanding at a date: in its own currency, and converted to the Base currency (null without a rate). */
export type LoanWorth<L> = {
	loan: L;
	currency: string;
	outstanding: Money;
	value: Money | null;
};

/**
 * Loans summary (spec §3.5): what's still owed to the household (Lent) and by it (Borrowed) at the period's end, or
 * today while it runs, Loan by Loan, converted at the latest rates; against the previous period's end and the average
 * of the three month-ends before. A Loan written off by then (in the household's timezone), or settled, isn't
 * outstanding. The members filter picks Loans by who recorded the principal; each counts all its Entries.
 */
export const loansSummary = <
	L extends {
		id: string;
		direction: LoanDirection;
		written_off_at: string | null;
	},
>({
	loans,
	entries,
	wallets,
	members,
	period,
	startDay,
	currency,
	rates,
	today,
	timeZone,
}: {
	loans: readonly L[];
	entries: readonly (ReportEntry & {
		loan_id: string | null;
		wallet_id: string;
	})[];
	wallets: readonly { id: string; currency: string }[];
	members: readonly string[];
	period: ReportPeriod;
	startDay: number;
	currency: string;
	rates: readonly RateRow[];
	today: string;
	/** The household's: when a write-off happened is its date there. */
	timeZone: string;
}) => {
	const zero = zeroMoney(currency);
	const picked = new Set(
		byMembers(
			entries.filter((entry) => entry.kind === "loan_principal"),
			members,
		).map((entry) => entry.loan_id),
	);
	const currencyOf = new Map(wallets.map((w) => [w.id, w.currency]));
	const asOf = (date: string) => {
		const open = loans.flatMap((loan): LoanWorth<L>[] => {
			if (!picked.has(loan.id)) return [];
			const own = entries.filter(
				(entry) => entry.loan_id === loan.id && entry.occurred_on <= date,
			);
			const principal = own.find((entry) => entry.kind === "loan_principal");
			const loanCurrency = principal && currencyOf.get(principal.wallet_id);
			if (!loanCurrency) return [];
			const outstanding = loanOutstanding(loan.direction, loanCurrency, own);
			const writtenOff =
				loan.written_off_at !== null &&
				calendarDateIn(new Date(loan.written_off_at), timeZone) <= date;
			if (isSettled(outstanding, writtenOff)) return [];
			return [
				{
					loan,
					currency: loanCurrency,
					outstanding,
					value:
						loanCurrency === currency
							? outstanding
							: (convertAt(outstanding, currency, today, rates)?.amount ??
								null),
				},
			];
		});
		const total = (direction: LoanDirection) =>
			open
				.filter((l) => l.loan.direction === direction)
				.reduce<Money>((sum, l) => addMoney(sum, l.value ?? zero), zero);
		return { open, lent: total("lent"), borrowed: total("borrowed") };
	};
	const end = asOf(until(period.last, today));
	const before = asOf(until(previousPeriod(period, startDay).last, today));
	const basis = averageBasis(period, startDay).months.map((month) =>
		asOf(until(budgetMonthRange(month, startDay).last, today)),
	);
	const average = (pick: (at: { lent: Money; borrowed: Money }) => Money) =>
		basis.map(pick).reduce<Money>(addMoney, zero).dividedInto(3);
	return {
		period,
		currency,
		loans: end.open,
		lent: end.lent,
		borrowed: end.borrowed,
		/** Loans with no rate held for their currency: left out of the totals. */
		unconverted: end.open.filter((l) => l.value === null).length,
		previous: { lent: before.lent, borrowed: before.borrowed },
		average: {
			lent: average((a) => a.lent),
			borrowed: average((a) => a.borrowed),
		},
	};
};

/** Where a Balance drills down to: the Entries up to its date, in these Wallets (all when none), by these members. */
export const drillToBalances = ({
	walletIds,
	until: last,
	members,
}: {
	walletIds: readonly string[];
	until: string;
	members: readonly string[];
}): EntryFilter => ({ ...NO_FILTER, walletIds, memberIds: members, to: last });

const LOAN_KINDS = ["loan_principal", "repayment"];

/**
 * Where a Loan's outstanding amount drills down to: these Loans' principals and Repayments up to its date, whoever
 * recorded them (a Loan counts all its Entries).
 */
export const drillToLoans = ({
	loanIds,
	until: last,
}: {
	loanIds: readonly string[];
	until: string;
}): EntryFilter => ({ ...NO_FILTER, kinds: LOAN_KINDS, loanIds, to: last });

/** The earlier of a period's last day and today: where a report's figures stand. */
export const standingDate = (period: ReportPeriod, today: string) =>
	until(period.last, today);
