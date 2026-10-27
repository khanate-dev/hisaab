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
	"household_transfer",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** The two Category lists (CONTEXT.md). Mirrors the `categories.kind` check. */
export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Which way a Loan went: the domain's, so its rules and the schema agree. */
export { LOAN_DIRECTIONS, type LoanDirection } from "@hisaab/domain";

/** Recurring rule modes and schedules, and what's done with Occurrences: the domain's, so its rules and the schema agree. */
export {
	OCCURRENCE_STATES,
	type OccurrenceState,
	RECURRING_FREQUENCIES,
	type RecurringFrequency,
	RECURRING_MODES,
	type RecurringMode,
} from "@hisaab/domain";
