import type { entries, entryItems } from "@hisaab/client-schema";
import type { FlowKind } from "@hisaab/domain";

/** An Entry row as it syncs to the device. */
export type Entry = typeof entries.$inferSelect;

/** An Item row as it syncs to the device. */
export type EntryItem = typeof entryItems.$inferSelect;

/** One Item as saved: how much (positive text, in the Expense's Wallet's currency), its Category, an optional quantity. */
export type ItemDraft = {
	/** Kept across edits, so concurrent edits of an Expense meet on the same rows (ADR-0007). */
	id: string;
	description: string;
	amount: string;
	quantity: string | null;
	categoryId: string;
	/** The Rest: what the other Items left of the receipt total. */
	rest: boolean;
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

/** A Transfer as its form edits it: what leaves one Wallet and, between currencies, what arrives in the other. */
export type TransferDraft = {
	fromWalletId: string;
	toWalletId: string;
	/** How much leaves, positive, in the From Wallet's currency. */
	amount: string;
	/** How much arrives, in the To Wallet's currency: the same as `amount` until Transfers between currencies (#45). */
	toAmount: string;
	occurredOn: string;
	description: string | null;
	notes: string | null;
};
