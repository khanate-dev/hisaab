import { newestFirst, type Money, parseMoney } from "@hisaab/domain";

import type { Category } from "@/features/categories/types";

import type { Entry, EntryItem, WalletChoice } from "./types";

/** An Entry with what it points at, as the list and detail show it. */
export type EntryView = {
	entry: Entry;
	amount: Money;
	wallet: WalletChoice;
	/** A Transfer's other Wallet and what arrived in it. */
	to: { wallet: WalletChoice; amount: Money } | null;
	category: Category | null;
	/** The Category's parent, when it's a Subcategory. */
	parent: Category | null;
	/** An itemized Expense's Items, in the order they were added. */
	items: ItemView[];
};

export type ItemView = {
	item: EntryItem;
	amount: Money;
	category: Category | null;
};

/** Entries, newest first, joined to their Wallet and Category; one whose Wallet hasn't synced yet waits for it. */
export const toEntryViews = (
	entries: readonly Entry[],
	categories: readonly Category[],
	wallets: readonly WalletChoice[],
	items: readonly EntryItem[] = [],
): EntryView[] => {
	const itemsByEntry = new Map<string, EntryItem[]>();
	for (const item of items)
		itemsByEntry.set(item.entry_id, [
			...(itemsByEntry.get(item.entry_id) ?? []),
			item,
		]);
	const walletById = new Map(wallets.map((w) => [w.id, w]));
	const categoryById = new Map(categories.map((c) => [c.id, c]));
	return entries.toSorted(newestFirst).flatMap((entry) => {
		const wallet = walletById.get(entry.wallet_id);
		if (!wallet) return [];
		const toWallet =
			entry.to_wallet_id === null
				? undefined
				: walletById.get(entry.to_wallet_id);
		const to =
			toWallet && entry.to_amount !== null
				? {
						wallet: toWallet,
						amount: parseMoney(entry.to_amount, toWallet.currency),
					}
				: null;
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
				to,
				category,
				parent,
				items: (itemsByEntry.get(entry.id) ?? [])
					.toSorted((a, b) => a.position - b.position)
					.map((item) => ({
						item,
						amount: parseMoney(item.amount, wallet.currency),
						category: categoryById.get(item.category_id) ?? null,
					})),
			},
		];
	});
};
