import type { Searchable } from "@hisaab/domain";

import type { EntryView } from "@/features/entries/views";

const present = <T>(values: readonly (T | null | undefined)[]) =>
	values.filter((v): v is T => v !== null && v !== undefined);

/**
 * An Entry as search reads it: what it's called and noted as, its Wallets, Categories (with their parents, so a
 * parent finds its Subcategories' Entries) and Items, who recorded it, and every amount in it.
 */
export const toSearchable = (
	view: EntryView,
	title: string,
	parentOf: ReadonlyMap<string, string | null>,
): Searchable => {
	const itemCategories = view.items.flatMap(({ category }) =>
		category ? [category.id, parentOf.get(category.id)] : [],
	);
	return {
		kind: view.entry.kind,
		walletIds: present([view.wallet.id, view.arrival?.wallet.id]),
		categoryIds: present([
			view.category?.id,
			view.parent?.id,
			...itemCategories,
		]),
		createdBy: view.entry.created_by,
		occurredOn: view.entry.occurred_on,
		text: present([
			title,
			view.entry.description,
			view.entry.notes,
			view.category?.name,
			view.parent?.name,
			view.wallet.name,
			view.arrival?.wallet.name,
			...view.items.flatMap(({ item, category }) => [
				item.description,
				category?.name,
			]),
		]),
		amounts: [
			view.amount,
			...(view.arrival ? [view.arrival.amount] : []),
			...view.items.map((i) => i.amount),
		],
	};
};
