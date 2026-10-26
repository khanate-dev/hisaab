import {
	addMoney,
	type Money,
	negateMoney,
	parseMoney,
	zeroMoney,
} from "./money";

// ADR-0002: a Wallet's Balance is its opening Balance adjustment plus every Entry touching it. It is computed here,
// from the Entries' effects on their Wallets, and never stored as the truth.

type Wallet = { id: string; currency: string };

/** An Entry as Balances see it: a Transfer touches a second Wallet, the one its money arrives in. */
export type WalletEntry = {
	wallet_id: string;
	amount: string;
	to_wallet_id?: string | null;
	to_amount?: string | null;
};

/** What an Entry does to each Wallet it touches: one effect, or two for a Transfer (out of one, into the other). */
export const walletEffects = (
	entry: WalletEntry,
): { walletId: string; amount: string }[] => [
	{ walletId: entry.wallet_id, amount: entry.amount },
	...(entry.to_wallet_id && entry.to_amount
		? [{ walletId: entry.to_wallet_id, amount: entry.to_amount }]
		: []),
];

/** What an Entry does to one Wallet's Balance, as signed decimal text; null when it doesn't touch it. */
export const effectOn = (entry: WalletEntry, walletId: string): string | null =>
	walletEffects(entry).find((effect) => effect.walletId === walletId)?.amount ??
	null;

/** Each Wallet's Balance in its own currency; Entries for other Wallets are ignored. */
export const walletBalances = (
	wallets: readonly Wallet[],
	entries: readonly WalletEntry[],
): Map<string, Money> => {
	const balances = new Map(
		wallets.map((wallet) => [wallet.id, zeroMoney(wallet.currency)]),
	);
	for (const entry of entries) {
		for (const { walletId, amount } of walletEffects(entry)) {
			const balance = balances.get(walletId);
			if (balance)
				balances.set(
					walletId,
					addMoney(balance, parseMoney(amount, balance.currency)),
				);
		}
	}
	return balances;
};

/** The Balance adjustment that brings a Wallet from its Balance to the one it really has (spec §3.2). */
export const adjustmentTo = (balance: Money, actual: Money): Money =>
	addMoney(actual, negateMoney(balance));

/**
 * Whether an Entry of this kind counts in budgets and reports: spending and income do; a Transfer only moves money
 * and a Balance adjustment only corrects a Balance (spec §3.2), so neither does.
 */
export const countsInReports = (kind: string) =>
	kind === "expense" || kind === "income";
