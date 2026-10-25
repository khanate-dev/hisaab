import { addMoney, type Money, parseMoney, zeroMoney } from "./money";

type HistoryEntry = {
	id: string;
	amount: string;
	occurred_on: string;
	created_at: string;
};

export type BalanceStep = { entryId: string; balance: Money };

/** Ordinal, not locale-aware: ISO dates and timestamps sort correctly as plain strings. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Oldest first: by the Entry's date, then by when it was recorded, then by id so ties are stable. */
const chronological = (a: HistoryEntry, b: HistoryEntry) =>
	compare(a.occurred_on, b.occurred_on) ||
	compare(a.created_at, b.created_at) ||
	compare(a.id, b.id);

/** A Wallet's running Balance after each of its Entries, derived from them (ADR-0002). */
export const balanceHistory = (
	entries: readonly HistoryEntry[],
	currency: string,
): BalanceStep[] => {
	let balance = zeroMoney(currency);
	return entries.toSorted(chronological).map((entry) => {
		balance = addMoney(balance, parseMoney(entry.amount, currency));
		return { entryId: entry.id, balance };
	});
};
