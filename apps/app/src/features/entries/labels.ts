import type { EntryKind } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const ENTRY_KIND_LABELS: Record<EntryKind, MessageDescriptor> = {
	balance_adjustment: msg`Balance adjustment`,
	expense: msg`Expense`,
	income: msg`Income`,
};

/** What an Entry's kind is called; a kind from a newer build is just an Entry. */
export const entryKindLabel = (kind: string): MessageDescriptor =>
	Object.hasOwn(ENTRY_KIND_LABELS, kind)
		? ENTRY_KIND_LABELS[kind as EntryKind]
		: msg`Entry`;
