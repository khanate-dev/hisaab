import type { WalletType } from "@hisaab/client-schema";
import type { Money } from "@hisaab/domain";

/** A Wallet with its Balance, derived from its Entries (ADR-0002). */
export type WalletSummary = {
	id: string;
	name: string;
	type: WalletType;
	balance: Money;
};
