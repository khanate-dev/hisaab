import type { entries, entryItems } from "@hisaab/client-schema";
import type { FlowKind } from "@hisaab/domain";

/** An Entry row as it syncs to the device. */
export type Entry = typeof entries.$inferSelect;

/** An Item row as it syncs to the device. */
export type EntryItem = typeof entryItems.$inferSelect;

/** One Item as saved: how much (positive text, in the Expense's Wallet's currency), its Category, an optional quantity. */
export type ItemDraft = {
	description: string;
	amount: string;
	quantity: string | null;
	categoryId: string;
};

/** What the Entry form edits: an Expense or Income, its amount as typed (how much, unsigned). */
export type EntryDraft = {
	kind: FlowKind;
	amount: string;
	walletId: string;
	categoryId: string;
	occurredOn: string;
	occurredTime: string | null;
	description: string | null;
	notes: string | null;
	/** An Expense's Items, the Rest included; they add up to `amount`. Empty when it isn't itemized. */
	items: ItemDraft[];
};

/** A Wallet as the Entry form and lists need it. */
export type WalletChoice = {
	id: string;
	name: string;
	currency: string;
	archived_at: string | null;
};
