import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { shiftCalendarDate } from "./dates";
import { addMoney } from "./money";
import { myOverview, type OverviewHousehold } from "./overview";
import { incomeVsExpense, netWorth, reportPeriod } from "./reports";

const TODAY = "2026-10-20";
const period = reportPeriod("last_3_months", TODAY, 1);
const rates = [
	{ on_date: "2026-10-01", currency: "USD", per_usd: "1" },
	{ on_date: "2026-10-01", currency: "PKR", per_usd: "280" },
];

const day = fc
	.integer({ min: 0, max: 170 })
	.map((n) => shiftCalendarDate("2026-05-01", n));
const entry = (walletIds: readonly string[]) =>
	fc
		.record({
			id: fc.uuid(),
			kind: fc.constantFrom("expense", "income", "balance_adjustment"),
			cents: fc.integer({ min: 1, max: 1_000_000 }),
			wallet: fc.constantFrom(...walletIds),
			occurred_on: day,
		})
		.map((e) => ({
			id: e.id,
			kind: e.kind,
			amount: `${e.kind === "expense" ? "-" : ""}${(e.cents / 100).toFixed(2)}`,
			category_id: null,
			occurred_on: e.occurred_on,
			created_by: "u1",
			wallet_id: e.wallet,
		}));
const household = (
	id: string,
	currency: string,
): fc.Arbitrary<OverviewHousehold> =>
	fc
		.uniqueArray(entry([`${id}-w1`, `${id}-w2`]), {
			selector: (e) => e.id,
			maxLength: 15,
		})
		.map((entries) => ({
			id,
			baseCurrency: currency,
			wallets: [
				{ id: `${id}-w1`, currency },
				{ id: `${id}-w2`, currency },
			],
			entries,
		}));

const figures = (o: ReturnType<typeof myOverview>) => ({
	worth: o.worth.total.toString(),
	previous: o.worth.previous.toString(),
	months: o.worth.months.map((m) => m.total.toString()),
	income: o.flow.total.income.toString(),
	expense: o.flow.total.expense.toString(),
});

describe("myOverview", () => {
	it("is one household's Net worth and Income vs expense when that's all there is, in its currency", () => {
		fc.assert(
			fc.property(household("h1", "USD"), (h) => {
				const overview = myOverview({
					households: [h],
					currency: "USD",
					period,
					rates,
					today: TODAY,
				});
				const scope = {
					entries: h.entries,
					members: [],
					period,
					startDay: 1,
					currency: "USD",
				};
				const worth = netWorth({
					...scope,
					wallets: h.wallets,
					rates,
					today: TODAY,
				});
				const flow = incomeVsExpense(scope);
				expect(overview.approximate).toBe(false);
				expect(overview.worth.total.toString()).toBe(worth.total.toString());
				expect(overview.worth.average.toString()).toBe(
					worth.average.toString(),
				);
				expect(overview.flow.total.net.toString()).toBe(
					flow.total.net.toString(),
				);
				expect(overview.flow.months.map((m) => m.expense.toString())).toEqual(
					flow.months.map((m) => m.expense.toString()),
				);
			}),
		);
	});

	it("adds households up, and a Cross-household transfer between them cancels out", () => {
		fc.assert(
			fc.property(
				household("h1", "USD"),
				household("h2", "USD"),
				fc.integer({ min: 1, max: 1_000_000 }),
				day,
				(a, b, cents, on) => {
					const at = (households: OverviewHousehold[]) =>
						figures(
							myOverview({
								households,
								currency: "USD",
								period,
								rates,
								today: TODAY,
							}),
						);
					const amount = (cents / 100).toFixed(2);
					const half = (id: string, wallet: string, signed: string) => ({
						id,
						kind: "household_transfer",
						amount: signed,
						category_id: null,
						occurred_on: on,
						created_by: "u1",
						wallet_id: wallet,
					});
					const moved = at([
						{
							...a,
							entries: [...a.entries, half("out", "h1-w1", `-${amount}`)],
						},
						{ ...b, entries: [...b.entries, half("in", "h2-w2", amount)] },
					]);
					expect(moved).toEqual(at([a, b]));
					const overview = (households: OverviewHousehold[]) =>
						myOverview({
							households,
							currency: "USD",
							period,
							rates,
							today: TODAY,
						});
					const [both, one, two] = [
						overview([a, b]),
						overview([a]),
						overview([b]),
					];
					expect(both.worth.total.toString()).toBe(
						addMoney(one.worth.total, two.worth.total).toString(),
					);
					expect(both.flow.total.net.toString()).toBe(
						addMoney(one.flow.total.net, two.flow.total.net).toString(),
					);
				},
			),
		);
	});

	it("converts other currencies at the latest rates, says it's approximate, and counts what it can't convert", () => {
		const h = (
			id: string,
			currency: string,
			amount: string,
			kind = "income",
		) => ({
			id,
			baseCurrency: currency,
			wallets: [{ id: `${id}-w`, currency }],
			entries: [
				{
					id: `${id}-e`,
					kind,
					amount,
					category_id: null,
					occurred_on: "2026-10-05",
					created_by: "u1",
					wallet_id: `${id}-w`,
				},
			],
		});
		const overview = myOverview({
			households: [
				h("h1", "USD", "100"),
				h("h2", "PKR", "28000"),
				h("h3", "EUR", "50"),
			],
			currency: "USD",
			period,
			rates,
			today: TODAY,
		});
		expect(overview.approximate).toBe(true);
		expect(overview.worth.total.toString()).toBe("200");
		expect(overview.flow.total.income.toString()).toBe("200");
		// EUR has no rate: its Wallet and its flow are left out, one household counted once.
		expect(overview.unconverted).toBe(1);
	});

	it("nets a Cross-household transfer between currencies out of Net worth at the latest rates, and out of the flow", () => {
		const half = (id: string, wallet: string, amount: string) => ({
			id,
			kind: "household_transfer",
			amount,
			category_id: null,
			occurred_on: "2026-10-05",
			created_by: "u1",
			wallet_id: wallet,
		});
		const overview = myOverview({
			households: [
				{
					id: "h1",
					baseCurrency: "USD",
					wallets: [{ id: "usd", currency: "USD" }],
					entries: [half("out", "usd", "-100")],
				},
				{
					id: "h2",
					baseCurrency: "PKR",
					wallets: [{ id: "pkr", currency: "PKR" }],
					entries: [half("in", "pkr", "28000")],
				},
			],
			currency: "USD",
			period,
			rates,
			today: TODAY,
		});
		expect(overview.worth.total.toString()).toBe("0");
		expect(overview.flow.total.income.toString()).toBe("0");
		expect(overview.flow.total.expense.toString()).toBe("0");
		expect(overview.approximate).toBe(true);
	});
});
