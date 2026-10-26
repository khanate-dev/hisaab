import {
	isCalendarDate,
	isDecimalAmount,
	isFlowKind,
	magnitude,
	parseMoney,
} from "@hisaab/domain";

import type { Category } from "@/features/categories/types";

import type { Entry, EntryDraft, WalletChoice } from "./types";

/** Trimmed text, or null when nothing's left: how optional fields are stored. */
export const orNull = (text: string) =>
	text.trim() === "" ? null : text.trim();

/**
 * The Wallets a new Entry can go into: active ones, in the household's Base currency until Base amounts land (#45,
 * ADR-0005). Null before the household has a Base currency.
 */
export const recordableWallets = (
	wallets: readonly WalletChoice[],
	baseCurrency: string | null,
) =>
	wallets.filter(
		(w) =>
			w.archived_at === null &&
			(baseCurrency === null || w.currency === baseCurrency),
	);

/**
 * What repeating a past Entry fills in (a Recent chip or a suggestion): its description and amount always, its
 * Category unless that's archived (then none, rather than whatever was picked before), and its Wallet if a new
 * Entry can still go into it.
 */
export const repeatEntry = (
	past: Entry,
	categories: readonly Category[],
	wallets: readonly WalletChoice[],
	baseCurrency: string | null,
): Pick<EntryDraft, "description" | "amount" | "categoryId"> & {
	walletId?: string;
} => {
	const category = categories.find((c) => c.id === past.category_id);
	const pastWallet = wallets.find((w) => w.id === past.wallet_id);
	const usable = recordableWallets(wallets, baseCurrency).some(
		(w) => w.id === pastWallet?.id,
	);
	return {
		description: past.description,
		amount: pastWallet
			? magnitude(parseMoney(past.amount, pastWallet.currency)).toString()
			: past.amount.replace(/^-/, ""),
		categoryId: category && category.archived_at === null ? category.id : "",
		...(pastWallet && usable && { walletId: pastWallet.id }),
	};
};

/** The full form's route parameters for a draft so far (quick-add's Items chip). */
export type DraftParams = {
	kind?: string;
	wallet?: string;
	amount?: string;
	category?: string;
	description?: string;
	date?: string;
	/** "1" opens the form on splitting the Expense into Items. */
	split?: string;
};

export const draftToParams = (draft: Partial<EntryDraft>): DraftParams => ({
	...(draft.kind && { kind: draft.kind }),
	...(draft.walletId && { wallet: draft.walletId }),
	...(draft.amount && { amount: draft.amount }),
	...(draft.categoryId && { category: draft.categoryId }),
	...(draft.description && { description: draft.description }),
	...(draft.occurredOn && { date: draft.occurredOn }),
});

/** The draft a link carries, keeping only what's well-formed; the form checks the rest on save. */
export const paramsToDraft = (params: DraftParams): Partial<EntryDraft> => ({
	...(isFlowKind(params.kind) && { kind: params.kind }),
	...(params.wallet && { walletId: params.wallet }),
	...(params.amount &&
		isDecimalAmount(params.amount) && { amount: params.amount }),
	...(params.category && { categoryId: params.category }),
	...(params.description && { description: params.description }),
	...(params.date &&
		isCalendarDate(params.date) && { occurredOn: params.date }),
});
