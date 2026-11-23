// My overview (spec §3.5, CONTEXT.md): a User's own combined net worth and income vs expense across every household
// they belong to, in their display currency, converted at the latest rates. Calendar months, since households'
// Budget months can start on different days. A Cross-household transfer moves money between two of the User's own
// households and is neither income nor expense, so its halves cancel.

import type { WalletEntry } from "./balances";
import { convertAt, type RateRow } from "./base-amounts";
import { budgetMonthRange } from "./budgets";
import { addMoney, type Money, zeroMoney } from "./money";
import {
	incomeVsExpense,
	netWorth,
	type ReportEntry,
	type ReportPeriod,
} from "./reports";

/** One of the User's households, as My overview reads it. */
export type OverviewHousehold = {
	id: string;
	/** Null until its first Wallet sets it. */
	baseCurrency: string | null;
	wallets: readonly { id: string; currency: string }[];
	entries: readonly (ReportEntry & WalletEntry)[];
};

type Flow = { income: Money; expense: Money; net: Money };

/**
 * My overview over a period of calendar months ending today. A household or Wallet whose currency has no rate yet is
 * left out and counted; it's approximate whenever any Wallet is in another currency than the display one.
 */
export const myOverview = ({
	households,
	currency,
	period,
	rates,
	today,
}: {
	households: readonly OverviewHousehold[];
	/** The User's display currency. */
	currency: string;
	/** Calendar months (a Budget month starting on the 1st). */
	period: ReportPeriod;
	rates: readonly RateRow[];
	today: string;
}) => {
	const zero = zeroMoney(currency);
	const add = (a: Money, b: Money) => addMoney(a, b);
	const noFlow: Flow = { income: zero, expense: zero, net: zero };
	const addFlow = (a: Flow, b: Flow): Flow => ({
		income: add(a.income, b.income),
		expense: add(a.expense, b.expense),
		net: add(a.net, b.net),
	});
	let unconverted = 0;

	const worths = households.map((household) =>
		netWorth({
			wallets: household.wallets,
			entries: household.entries,
			members: [],
			period,
			startDay: 1,
			currency,
			rates,
			today,
		}),
	);
	unconverted += worths.reduce((n, worth) => n + worth.unconverted, 0);

	// Each household's flow is in its Base currency; the lot converts to the display one at the latest rates.
	const flowsIn = households.flatMap((household) => {
		if (household.baseCurrency === null) return [];
		const report = incomeVsExpense({
			entries: household.entries,
			members: [],
			period,
			startDay: 1,
			currency: household.baseCurrency,
		});
		const convert = (money: Money) =>
			money.currency === currency
				? money
				: (convertAt(money, currency, today, rates)?.amount ?? null);
		const flow = (f: Flow): Flow | null => {
			const income = convert(f.income);
			const expense = convert(f.expense);
			const net = convert(f.net);
			return income && expense && net ? { income, expense, net } : null;
		};
		const total = flow(report.total);
		if (total === null) {
			if (!report.total.income.isZero() || !report.total.expense.isZero())
				unconverted += 1;
			return [];
		}
		return [
			{
				total,
				previous: flow(report.previous) ?? noFlow,
				average: flow(report.average) ?? noFlow,
				months: report.months.map((m) => ({
					month: m.month,
					...(flow(m) ?? noFlow),
				})),
				unpriced: report.unpriced,
			},
		];
	});

	return {
		period,
		currency,
		/** Some Wallet is in another currency: the figures are converted, so approximate. */
		approximate: households.some((household) =>
			household.wallets.some((wallet) => wallet.currency !== currency),
		),
		/** Wallets and households left out for want of a rate. */
		unconverted,
		/** Entries the households' reports couldn't price yet. */
		unpriced: flowsIn.reduce((n, f) => n + f.unpriced, 0),
		worth: {
			total: worths.reduce((sum, w) => add(sum, w.total), zero),
			previous: worths.reduce((sum, w) => add(sum, w.previous), zero),
			average: worths.reduce((sum, w) => add(sum, w.average), zero),
			// Month-ends so far: a month still to come has none.
			months: period.months
				.filter((month) => budgetMonthRange(month, 1).first <= today)
				.map((month) => ({
					month,
					total: worths.reduce(
						(sum, w) =>
							add(sum, w.months.find((m) => m.month === month)?.total ?? zero),
						zero,
					),
				})),
		},
		flow: {
			total: flowsIn.reduce((sum, f) => addFlow(sum, f.total), noFlow),
			previous: flowsIn.reduce((sum, f) => addFlow(sum, f.previous), noFlow),
			average: flowsIn.reduce((sum, f) => addFlow(sum, f.average), noFlow),
			months: period.months.map((month) => ({
				month,
				...flowsIn.reduce(
					(sum, f) =>
						addFlow(sum, f.months.find((m) => m.month === month) ?? noFlow),
					noFlow,
				),
			})),
		},
	};
};
