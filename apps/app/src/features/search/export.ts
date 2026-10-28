import type { ExportEntry } from "@hisaab/domain";

import type { EntryView } from "@/features/entries/views";

/** An Entry as the Spreadsheet export writes it: names in words, money exactly as stored. */
export const toExportEntry = (
	view: EntryView,
	words: {
		kind: string;
		/** A Category under its parent, "Food: Groceries". */
		category: (name: string, parent: string | undefined) => string;
		contact: string | null;
	},
): ExportEntry => ({
	id: view.entry.id,
	occurredOn: view.entry.occurred_on,
	occurredTime: view.entry.occurred_time,
	kind: words.kind,
	description: view.entry.description,
	category: view.category
		? words.category(view.category.name, view.parent?.name)
		: null,
	wallet: view.wallet.name,
	currency: view.wallet.currency,
	amount: view.entry.amount,
	toWallet: view.arrival?.wallet.name ?? null,
	received: view.entry.to_amount,
	notes: view.entry.notes,
	recordedBy: view.madeBy,
	contact: words.contact,
	items: view.items.map(({ item, category }) => ({
		description: item.description,
		category: category?.name ?? null,
		amount: item.amount,
		quantity: item.quantity,
	})),
});
