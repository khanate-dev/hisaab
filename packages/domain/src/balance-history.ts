import { addMoney, type Money, parseMoney, zeroMoney } from "./money";

import { chronological, type Dated } from "./entry-order";

type HistoryEntry = Dated & { amount: string };

/** One Entry, its amount as Money and the Wallet's Balance just after it. */
export type BalanceStep<T extends HistoryEntry = HistoryEntry> = {
	entry: T;
	amount: Money;
	balance: Money;
};

/** A Wallet's running Balance after each of its Entries, derived from them (ADR-0002). */
export const balanceHistory = <T extends HistoryEntry>(
	entries: readonly T[],
	currency: string,
): BalanceStep<T>[] => {
	let balance = zeroMoney(currency);
	return entries.toSorted(chronological).map((entry) => {
		const amount = parseMoney(entry.amount, currency);
		balance = addMoney(balance, amount);
		return { entry, amount, balance };
	});
};
