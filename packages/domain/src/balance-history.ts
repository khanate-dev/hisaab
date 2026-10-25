import { addMoney, type Money, parseMoney, zeroMoney } from "./money";

type HistoryEntry = {
	id: string;
	amount: string;
	occurred_on: string;
	created_at: string;
};

/** One Entry, its amount as Money and the Wallet's Balance just after it. */
export type BalanceStep<T extends HistoryEntry = HistoryEntry> = {
	entry: T;
	amount: Money;
	balance: Money;
};

/** Ordinal, not locale-aware: ISO dates and timestamps sort correctly as plain strings. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Oldest first: by the Entry's date, then by when it was recorded, then by id so ties are stable. */
const chronological = (a: HistoryEntry, b: HistoryEntry) =>
	compare(a.occurred_on, b.occurred_on) ||
	compare(a.created_at, b.created_at) ||
	compare(a.id, b.id);

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
