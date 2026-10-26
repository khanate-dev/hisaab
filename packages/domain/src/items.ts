import {
	addMoney,
	isNegative,
	isZero,
	type Money,
	negateMoney,
	sumMoney,
	zeroMoney,
} from "./money";

// Itemized Expenses, total first (spec §4.3): the typed amount is the receipt total, the Items split out of it, and
// what's left is the Rest. Once an Expense has Items, its total is their sum.

export type Itemized = {
	/** The Expense's total: the receipt total, or the Items' sum when they ran over it. */
	total: Money;
	/** What the Items leave of the total; never negative. */
	rest: Money;
	/** The Items add up to more than the receipt total, so the total grew to match. */
	over: boolean;
};

/** A receipt total split into Items: the Rest left over, or the total grown to the Items' sum. */
export const itemize = (
	receiptTotal: Money,
	items: readonly Money[],
): Itemized => {
	const split = sumMoney(items, receiptTotal.currency);
	const rest = addMoney(receiptTotal, negateMoney(split));
	return isNegative(rest)
		? { total: split, rest: zeroMoney(receiptTotal.currency), over: true }
		: { total: receiptTotal, rest, over: false };
};

/**
 * The Items to save: those split out, then a non-zero Rest as one more Item (`restItem` makes it, say "Other
 * Groceries" in the Expense's Category), so the Items always add up to the total.
 */
export const withRest = <T extends { amount: Money }>(
	receiptTotal: Money,
	items: readonly T[],
	restItem: (rest: Money) => T,
): { total: Money; items: T[] } => {
	const { total, rest } = itemize(
		receiptTotal,
		items.map((item) => item.amount),
	);
	return {
		total,
		items:
			isZero(rest) || items.length === 0
				? [...items]
				: [...items, restItem(rest)],
	};
};
