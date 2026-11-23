import DecimalBase from "decimal.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	baseAmountOf,
	baseValue,
	itemBaseShares,
	type RateRow,
	rateFor,
} from "./base-amounts";
import { categoryTotals } from "./budgets";
import { currencyDecimals, parseMoney } from "./money";

const rates: RateRow[] = [
	{ on_date: "2026-11-01", currency: "USD", per_usd: "1" },
	{ on_date: "2026-11-01", currency: "PKR", per_usd: "280.5" },
	{ on_date: "2026-11-03", currency: "PKR", per_usd: "281" },
	{ on_date: "2026-11-03", currency: "JPY", per_usd: "150" },
];

/** A positive decimal with up to `scale` places. */
const decimal = (scale: number, max = 10_000_000) =>
	fc
		.tuple(fc.integer({ min: 1, max }), fc.integer({ min: 0, max: scale }))
		.map(([n, s]) => new DecimalBase(n).dividedBy(10 ** s).toFixed());
const rate = decimal(6, 99_999_999);
const currency = fc.constantFrom("USD", "PKR", "JPY", "KWD", "EUR");

describe("rateFor", () => {
	it("takes the date's own rate, else the latest before it, else the earliest after it", () => {
		expect(rateFor(rates, "PKR", "2026-11-03")).toEqual({
			perUsd: "281",
			exact: true,
		});
		expect(rateFor(rates, "PKR", "2026-11-02")).toEqual({
			perUsd: "280.5",
			exact: false,
		});
		expect(rateFor(rates, "JPY", "2026-11-01")).toEqual({
			perUsd: "150",
			exact: false,
		});
		expect(rateFor(rates, "EUR", "2026-11-01")).toBe(null);
	});
});

describe("rateFor properties", () => {
	it("takes the date's own rate when held, else the nearest, never another currency's", () => {
		const day = fc
			.integer({ min: 1, max: 30 })
			.map((n) => `2026-11-${String(n).padStart(2, "0")}`);
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.record({ on_date: day, currency, per_usd: rate }), {
					maxLength: 12,
					selector: (r) => `${r.on_date} ${r.currency}`,
				}),
				currency,
				day,
				(held, code, date) => {
					const found = rateFor(held, code, date);
					const mine = held.filter((r) => r.currency === code);
					if (mine.length === 0) {
						expect(found).toBe(null);
						return;
					}
					const own = mine.find((r) => r.on_date === date);
					expect(found?.exact).toBe(own !== undefined);
					const dates = mine.map((r) => r.on_date).toSorted();
					const nearest =
						own?.on_date ?? dates.filter((d) => d < date).at(-1) ?? dates[0];
					expect(found?.perUsd).toBe(
						mine.find((r) => r.on_date === nearest)?.per_usd,
					);
				},
			),
		);
	});
});

describe("baseAmountOf", () => {
	it("prices an Entry at its date's market rate, and estimates without one", () => {
		const usd = parseMoney("-100", "USD");
		expect(
			baseAmountOf({
				amount: usd,
				baseCurrency: "PKR",
				date: "2026-11-01",
				rates,
			}),
		).toEqual({ amount: parseMoney("-28050", "PKR"), rate: "market" });
		expect(
			baseAmountOf({
				amount: usd,
				baseCurrency: "PKR",
				date: "2026-11-02",
				rates,
			}),
		).toEqual({ amount: parseMoney("-28050", "PKR"), rate: "estimated" });
		expect(
			baseAmountOf({
				amount: usd,
				baseCurrency: "EUR",
				date: "2026-11-01",
				rates,
			}),
		).toEqual({ amount: null, rate: "estimated" });
		expect(
			baseAmountOf({
				amount: parseMoney("5", "PKR"),
				baseCurrency: "PKR",
				date: "2026-11-01",
				rates,
			}),
		).toBe(null);
	});

	it("rounds half away from zero to the Base currency's minor units", () => {
		const day = [
			{ on_date: "2026-11-01", currency: "USD", per_usd: "1" },
			{ on_date: "2026-11-01", currency: "JPY", per_usd: "3" },
		];
		const at = (text: string) =>
			baseAmountOf({
				amount: parseMoney(text, "USD"),
				baseCurrency: "JPY",
				date: "2026-11-01",
				rates: day,
			})?.amount?.toString();
		expect(at("0.5")).toBe("2");
		expect(at("-0.5")).toBe("-2");
		expect(at("0.1")).toBe("0");
	});

	it("keeps the sign, stays within the Base currency's minor units, and is market only with both dates' own rates", () => {
		fc.assert(
			fc.property(
				decimal(3),
				fc.boolean(),
				currency,
				currency,
				rate,
				rate,
				fc.boolean(),
				(text, negative, from, to, fromRate, toRate, sameDay) => {
					fc.pre(from !== to);
					const amount = parseMoney(negative ? `-${text}` : text, from);
					const held: RateRow[] = [
						{ on_date: "2026-11-01", currency: from, per_usd: fromRate },
						{
							on_date: sameDay ? "2026-11-01" : "2026-10-01",
							currency: to,
							per_usd: toRate,
						},
					];
					const base = baseAmountOf({
						amount,
						baseCurrency: to,
						date: "2026-11-01",
						rates: held,
					});
					expect(base?.rate).toBe(sameDay ? "market" : "estimated");
					const value = base?.amount;
					expect(value?.currency).toBe(to);
					expect(value?.isNegative() || value?.isZero() || !negative).toBe(
						true,
					);
					expect(
						new DecimalBase(value?.toString() ?? "0").decimalPlaces(),
					).toBeLessThanOrEqual(currencyDecimals(to));
					const exact = new DecimalBase(amount.toString())
						.times(toRate)
						.dividedBy(fromRate);
					expect(
						exact
							.minus(value?.toString() ?? "0")
							.abs()
							.lte(new DecimalBase(10).pow(-currencyDecimals(to)).dividedBy(2)),
					).toBe(true);
				},
			),
		);
	});
});

describe("baseValue", () => {
	it("counts a Base-currency Entry's own amount, else its Base amount, and nothing while it has none", () => {
		expect(baseValue({ amount: "-5", base_rate: null }, "PKR")).toEqual(
			parseMoney("-5", "PKR"),
		);
		expect(
			baseValue(
				{ amount: "-5", base_amount: "-1400", base_rate: "market" },
				"PKR",
			),
		).toEqual(parseMoney("-1400", "PKR"));
		expect(
			baseValue(
				{ amount: "-5", base_amount: null, base_rate: "estimated" },
				"PKR",
			),
		).toBe(null);
	});
});

describe("baseValue properties", () => {
	it("is the amount for a Base-currency Entry, the Base amount otherwise, and nothing without one", () => {
		fc.assert(
			fc.property(
				decimal(2),
				fc.option(decimal(3)),
				fc.constantFrom<"market" | "estimated" | "edited" | null>(
					null,
					"market",
					"estimated",
					"edited",
				),
				(amount, base, rateKind) => {
					const expected = rateKind === null ? amount : base;
					expect(
						baseValue(
							{ amount, base_amount: base, base_rate: rateKind },
							"PKR",
						)?.toString() ?? null,
					).toBe(
						expected === null ? null : parseMoney(expected, "PKR").toString(),
					);
				},
			),
		);
	});
});

describe("itemBaseShares", () => {
	it("splits an Expense's Base amount across its Items in proportion, adding up to it exactly", () => {
		fc.assert(
			fc.property(
				fc.array(decimal(2, 100_000), { minLength: 1, maxLength: 6 }),
				decimal(2),
				(items, baseText) => {
					const total = items.reduce(
						(sum, a) => sum.plus(a),
						new DecimalBase(0),
					);
					const amount = parseMoney(`-${total.toFixed()}`, "USD");
					const base = parseMoney(`-${baseText}`, "PKR");
					const shares = itemBaseShares(
						items.map((a) => ({ amount: a })),
						amount,
						base,
					);
					expect(shares).toHaveLength(items.length);
					const sum = shares.reduce(
						(s, m) => s.plus(m.toString()),
						new DecimalBase(0),
					);
					expect(sum.toFixed()).toBe(new DecimalBase(baseText).toFixed());
					for (const [i, share] of shares.slice(0, -1).entries())
						expect(
							new DecimalBase(items[i] ?? "0")
								.times(baseText)
								.dividedBy(total)
								.minus(share.toString())
								.abs()
								.lte("0.005"),
						).toBe(true);
				},
			),
		);
	});

	it("gives each Item its own amount when the Expense is in the Base currency", () => {
		expect(
			itemBaseShares(
				[{ amount: "3.33" }, { amount: "6.67" }],
				parseMoney("-10", "PKR"),
				parseMoney("-10", "PKR"),
			).map(String),
		).toEqual(["3.33", "6.67"]);
	});
});

describe("categoryTotals with Base amounts", () => {
	it("counts an Entry in another currency at its Base amount, its Items' shares by position, and skips one without", () => {
		const range = { first: "2026-11-01", last: "2026-11-30" };
		const totals = categoryTotals(
			[
				{
					id: "e1",
					kind: "expense",
					amount: "-10",
					category_id: "food",
					occurred_on: "2026-11-02",
					base_amount: "-2805",
					base_rate: "market",
				},
				{
					id: "e2",
					kind: "expense",
					amount: "-3",
					category_id: null,
					occurred_on: "2026-11-02",
					base_amount: "-1000",
					base_rate: "edited",
				},
				{
					id: "e3",
					kind: "expense",
					amount: "-1",
					category_id: "food",
					occurred_on: "2026-11-02",
					base_amount: null,
					base_rate: "estimated",
				},
				{
					id: "e4",
					kind: "expense",
					amount: "-100",
					category_id: "food",
					occurred_on: "2026-11-02",
				},
			],
			[
				{ entry_id: "e2", amount: "2", category_id: "fuel", position: 1 },
				{ entry_id: "e2", amount: "1", category_id: "food", position: 0 },
			],
			new Map([
				["food", null],
				["fuel", null],
			]),
			range,
			"PKR",
		);
		expect(totals.get("food")?.toString()).toBe("3238.33");
		expect(totals.get("fuel")?.toString()).toBe("666.67");
	});
});
