import type { entries } from "@hisaab/client-schema";
import type { FlowKind } from "@hisaab/domain";

/** An Entry row as it syncs to the device. */
export type Entry = typeof entries.$inferSelect;

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
};
