import {
	isNegative,
	isZero,
	type Money,
	negateMoney,
	parseMoney,
	sumMoney,
} from "./money";

// Loans (spec §3.2): Lent to or Borrowed from a Contact. The principal and each Repayment are Entries, signed by
// their effect on the Wallet; what's outstanding is derived from them, never stored. No interest is modelled.

export type LoanDirection = "lent" | "borrowed";

/** A Loan's Entries as the outstanding amount needs them: their signed amounts. */
type LoanEntry = { amount: string };

/**
 * What's still owed on a Loan: its principal less its Repayments. Money Lent left the Wallet and comes back; money
 * Borrowed arrived and goes back, so the Entries' sum is minus (Lent) or plus (Borrowed) what's outstanding.
 */
export const loanOutstanding = (
	direction: LoanDirection,
	currency: string,
	entries: readonly LoanEntry[],
): Money => {
	const net = sumMoney(
		entries.map((entry) => parseMoney(entry.amount, currency)),
		currency,
	);
	return direction === "lent" ? negateMoney(net) : net;
};

/** A Loan is settled once nothing's outstanding, or once the rest is written off. */
export const isSettled = (outstanding: Money, writtenOff: boolean) =>
	writtenOff || isZero(outstanding) || isNegative(outstanding);
