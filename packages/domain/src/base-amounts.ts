import { addMoney, type Money, parseMoney, zeroMoney } from "./money";

// Base amounts (ADR-0005; CONTEXT.md; #45): an Entry in a Wallet whose currency isn't the household's Base currency
// carries its value in the Base currency, priced at its own date's market rate, frozen, and editable. The server
// (`private.fill_base_amount`) is the authority and computes the same figures; this is what a device shows meanwhile.

/** How an Entry's Base amount came about (the `base_rate` column). */
export const BASE_RATES = ["market", "estimated", "edited"] as const;
export type BaseRate = (typeof BASE_RATES)[number];

/** A synced exchange rate: a currency's rate per USD on a date (decimal text). */
export type RateRow = { on_date: string; currency: string; per_usd: string };

/**
 * A currency's rate per USD for a date: the date's own (`exact`), else the nearest held, the latest before it, else the
 * earliest after it; null when none is held at all. Postgres's `private.rate_per_usd` picks the same.
 */
export const rateFor = (
	rates: readonly RateRow[],
	currency: string,
	date: string,
): { perUsd: string; exact: boolean } | null => {
	let before: RateRow | undefined;
	let after: RateRow | undefined;
	for (const rate of rates) {
		if (rate.currency !== currency) continue;
		if (rate.on_date === date) return { perUsd: rate.per_usd, exact: true };
		if (rate.on_date < date) {
			if (!before || rate.on_date > before.on_date) before = rate;
		} else if (!after || rate.on_date < after.on_date) after = rate;
	}
	const nearest = before ?? after;
	return nearest ? { perUsd: nearest.per_usd, exact: false } : null;
};

/**
 * An Entry's Base amount as a device can price it: null when its Wallet is in the Base currency (it needs none);
 * otherwise the amount at the date's market rate, or an estimate at the nearest rates held (an amount of null when no
 * rate at all is held for one of the two currencies, until sync brings one).
 */
export const baseAmountOf = ({
	amount,
	baseCurrency,
	date,
	rates,
}: {
	amount: Money;
	baseCurrency: string;
	date: string;
	rates: readonly RateRow[];
}): { amount: Money | null; rate: "market" | "estimated" } | null => {
	if (amount.currency === baseCurrency) return null;
	const from = rateFor(rates, amount.currency, date);
	const to = rateFor(rates, baseCurrency, date);
	if (!from || !to) return { amount: null, rate: "estimated" };
	return {
		amount: amount.converted(from.perUsd, to.perUsd, baseCurrency),
		rate: from.exact && to.exact ? "market" : "estimated",
	};
};

/**
 * What an Entry counts as in the Base currency, for Budgets and money-flow reports: its own amount when it has no
 * `base_rate` (its Wallet is in the Base currency), else its Base amount; null while it has none yet (it counts
 * nowhere until it does). Postgres's `private.budget_levels` reads the same columns the same way.
 */
export const baseValue = (
	entry: {
		amount: string;
		base_amount?: string | null;
		base_rate?: string | null;
	},
	baseCurrency: string,
): Money | null => {
	if (entry.base_rate == null) return parseMoney(entry.amount, baseCurrency);
	return entry.base_amount == null
		? null
		: parseMoney(entry.base_amount, baseCurrency);
};

/**
 * An itemized Expense's Base amount split across its Items, in the Items' order: each in proportion to its amount,
 * rounded to the Base currency's minor units, the last taking whatever rounding leaves, so the shares always add up to
 * the Expense's. Postgres's `private.budget_levels` splits the same way.
 */
export const itemBaseShares = (
	items: readonly { amount: string }[],
	entryAmount: Money,
	entryBase: Money,
): Money[] => {
	const whole = entryAmount.isNegative() ? entryAmount.negated() : entryAmount;
	const base = entryBase.isNegative() ? entryBase.negated() : entryBase;
	const shares = items
		.slice(0, -1)
		.map((item) =>
			parseMoney(item.amount, entryAmount.currency).portion(whole, base),
		);
	const taken = shares.reduce(addMoney, zeroMoney(base.currency));
	return items.length === 0 ? [] : [...shares, addMoney(base, taken.negated())];
};
