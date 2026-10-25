import type { EntryKind, WalletType } from "@hisaab/client-schema";
import type { Money } from "@hisaab/domain";

/** A Wallet with its Balance, derived from its Entries (ADR-0002). */
export type WalletSummary = {
	id: string;
	name: string;
	type: WalletType;
	balance: Money;
	archived: boolean;
};

/** One step of a Wallet's balance history: an Entry and the Balance just after it. */
export type HistoryRow = {
	entryId: string;
	occurredOn: string;
	kind: EntryKind;
	amount: Money;
	balance: Money;
};
