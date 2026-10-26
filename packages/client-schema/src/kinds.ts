/** Wallet types (CONTEXT.md). Mirrors the `wallets.type` check in Postgres. */
export const WALLET_TYPES = [
	"cash",
	"bank",
	"mobile_wallet",
	"credit_card",
] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

/** Entry kinds (CONTEXT.md, Entry). Mirrors the `entries.kind` check. */
export const ENTRY_KINDS = [
	"balance_adjustment",
	"expense",
	"income",
	"transfer",
	"loan_principal",
	"repayment",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** The two Category lists (CONTEXT.md). Mirrors the `categories.kind` check. */
export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Which way a Loan went (CONTEXT.md, Loan). Mirrors the `loans.direction` check. */
export const LOAN_DIRECTIONS = ["lent", "borrowed"] as const;
export type LoanDirection = (typeof LOAN_DIRECTIONS)[number];
