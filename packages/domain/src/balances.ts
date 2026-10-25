import { addMoney, type Money, parseMoney, sumMoney } from "./money";

// ADR-0002: a Wallet's Balance is its opening Balance adjustment plus every Entry touching it. It is computed here,
// from the Entries' signed amounts (their effect on the Wallet), and never stored as the truth.

type Wallet = { id: string; currency: string };
type WalletEntry = { wallet_id: string; amount: string };

/** Each Wallet's Balance in its own currency; Entries for other Wallets are ignored. */
export const walletBalances = (
	wallets: readonly Wallet[],
	entries: readonly WalletEntry[],
): Map<string, Money> => {
	const balances = new Map(
		wallets.map((wallet) => [wallet.id, sumMoney([], wallet.currency)]),
	);
	for (const entry of entries) {
		const balance = balances.get(entry.wallet_id);
		if (balance)
			balances.set(
				entry.wallet_id,
				addMoney(balance, parseMoney(entry.amount, balance.currency)),
			);
	}
	return balances;
};
