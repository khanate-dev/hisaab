import { newestFirst, type Money, parseMoney } from "@hisaab/domain";

import type { Category } from "@/features/categories/types";

import type { Entry, WalletChoice } from "./types";

/** An Entry with what it points at, as the list and detail show it. */
export type EntryView = {
	entry: Entry;
	amount: Money;
	wallet: WalletChoice;
	category: Category | null;
	/** The Category's parent, when it's a Subcategory. */
	parent: Category | null;
};

/** Entries, newest first, joined to their Wallet and Category; one whose Wallet hasn't synced yet waits for it. */
export const toEntryViews = (
	entries: readonly Entry[],
	categories: readonly Category[],
	wallets: readonly WalletChoice[],
): EntryView[] => {
	const walletById = new Map(wallets.map((w) => [w.id, w]));
	const categoryById = new Map(categories.map((c) => [c.id, c]));
	return entries.toSorted(newestFirst).flatMap((entry) => {
		const wallet = walletById.get(entry.wallet_id);
		if (!wallet) return [];
		const category =
			entry.category_id === null
				? null
				: (categoryById.get(entry.category_id) ?? null);
		const parent =
			category?.parent_id == null
				? null
				: (categoryById.get(category.parent_id) ?? null);
		return [
			{
				entry,
				amount: parseMoney(entry.amount, wallet.currency),
				wallet,
				category,
				parent,
			},
		];
	});
};
