/** Wallet types (CONTEXT.md). Mirrors the `wallets.type` check in Postgres. */
export const WALLET_TYPES = [
	"cash",
	"bank",
	"mobile_wallet",
	"credit_card",
] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

/** Entry kinds so far; Transfer and Loans join as they land. Mirrors the `entries.kind` check. */
export const ENTRY_KINDS = ["balance_adjustment", "expense", "income"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** The two Category lists (CONTEXT.md). Mirrors the `categories.kind` check. */
export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
