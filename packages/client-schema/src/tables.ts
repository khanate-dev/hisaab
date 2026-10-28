import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import {
	CATEGORY_KINDS,
	ENTRY_KINDS,
	LOAN_DIRECTIONS,
	OCCURRENCE_STATES,
	RECURRING_FREQUENCIES,
	RECURRING_MODES,
	WALLET_TYPES,
} from "./kinds";
import { ROLES } from "./roles";
import { DELETED_COLUMN, STAMP_COLUMN } from "./stamp";

// Synced tables mirror their Sync Streams columns (powersync/sync-config.yaml), not the Postgres tables.

/**
 * Write-only: the contract version a local write was made under, which PowerSync attaches to the queued op
 * (ADR-0009). Set it with `stamped()`; it never syncs and is never uploaded as a column.
 */
const contractStamp = () => text(STAMP_COLUMN);
/** PowerSync's delete flag, written only by `stampedDelete()`; never a column of its own. */
const deleteFlag = () => integer(DELETED_COLUMN, { mode: "boolean" });

export const households = sqliteTable("households", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	/** Set only on a Personal household: the User it belongs to. */
	personal_user_id: text("personal_user_id"),
	/** ISO 4217; set by First Wallet onboarding and fixed once the household has an Entry (ADR-0005). */
	base_currency: text("base_currency"),
	/** IANA; Entry dates are in it. Set by onboarding from the device; null means "use the device's". */
	timezone: text("timezone"),
	/** The day each Budget month starts on, 1 to 28 (`BUDGET_MONTH_START_DAYS`). */
	budget_month_start_day: integer("budget_month_start_day").notNull(),
	/** Who created a shared household, and so became its first Admin; null on Personal households. */
	created_by: text("created_by"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

export const memberships = sqliteTable("memberships", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	user_id: text("user_id").notNull(),
	role: text("role", { enum: ROLES }).notNull(),
	/** The Member's own pick of Wallet for new Entries in this household; null means none picked. */
	default_wallet_id: text("default_wallet_id"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** A User's name, shown to the people they share a household with. */
export const profiles = sqliteTable("profiles", {
	id: text("id").primaryKey(),
	display_name: text("display_name").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

export const wallets = sqliteTable("wallets", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	name: text("name").notNull(),
	type: text("type", { enum: WALLET_TYPES }).notNull(),
	/** ISO 4217. */
	currency: text("currency").notNull(),
	archived_at: text("archived_at"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

export const categories = sqliteTable("categories", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
	/** A Subcategory's parent; null for a top-level Category. One level deep only. */
	parent_id: text("parent_id"),
	name: text("name").notNull(),
	/** Keys into the app's icon and colour registries (ADR-0008). */
	icon: text("icon").notNull(),
	color: text("color").notNull(),
	archived_at: text("archived_at"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** A person outside the app, in a household's reusable list, who can be a Loan's counterparty (CONTEXT.md). */
export const contacts = sqliteTable("contacts", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	name: text("name").notNull(),
	archived_at: text("archived_at"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** Money Lent to or Borrowed from a Contact; its principal and Repayments are Entries, its outstanding derived. */
export const loans = sqliteTable("loans", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	contact_id: text("contact_id").notNull(),
	direction: text("direction", { enum: LOAN_DIRECTIONS }).notNull(),
	/** YYYY-MM-DD; optional. */
	due_on: text("due_on"),
	/** Settled by writing off what's left. */
	written_off_at: text("written_off_at"),
	notes: text("notes"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/**
 * A Budget, or for an income Category its Expected income: a standing amount per Budget month, valid from one
 * onward until a later one replaces it (CONTEXT.md).
 */
export const budgets = sqliteTable("budgets", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	category_id: text("category_id").notNull(),
	/** The Budget month it's valid from, YYYY-MM. */
	valid_from: text("valid_from").notNull(),
	/** Exact decimal text in the Base currency, zero or more; null for no Budget from this month on. */
	amount: text("amount"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** A Budget override: a replacement Budget (or Expected income) amount for one Budget month. */
export const budgetOverrides = sqliteTable("budget_overrides", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	category_id: text("category_id").notNull(),
	/** The Budget month it replaces the standing amount in, YYYY-MM. */
	month: text("month").notNull(),
	/** Exact decimal text in the Base currency, zero or more. Parse with parseMoney. */
	amount: text("amount").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** A template Expense or Income plus a schedule that produces Occurrences (CONTEXT.md). */
export const recurringRules = sqliteTable("recurring_rules", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	/** Confirm (the default) leaves each Occurrence Pending; Auto-record makes it an Entry when it's due. */
	mode: text("mode", { enum: RECURRING_MODES }).notNull(),
	kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
	wallet_id: text("wallet_id").notNull(),
	category_id: text("category_id").notNull(),
	/** Exact decimal text, positive; null for a variable bill, asked for when it's confirmed. */
	amount: text("amount"),
	description: text("description"),
	frequency: text("frequency", { enum: RECURRING_FREQUENCIES }).notNull(),
	/** Every this many months, weeks or years. */
	interval: integer("interval").notNull(),
	/** Monthly rules only: 1 to 31, the last day of a shorter month. */
	day_of_month: integer("day_of_month"),
	/** YYYY-MM-DD; a weekly rule falls on its weekday, a yearly one on its day. */
	starts_on: text("starts_on").notNull(),
	ends_on: text("ends_on"),
	created_by: text("created_by").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** What the household did with an Occurrence; one without a row is Pending once due. Ids from `occurrenceId`. */
export const occurrences = sqliteTable("occurrences", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	rule_id: text("rule_id").notNull(),
	/** YYYY-MM-DD. */
	due_on: text("due_on").notNull(),
	state: text("state", { enum: OCCURRENCE_STATES }).notNull(),
	/** Snoozed ones are Pending again from this date. */
	snoozed_until: text("snoozed_until"),
	/** The Entry a confirmed one became (`occurrenceEntryId`). */
	entry_id: text("entry_id"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** An image or PDF attached to an Entry; the file is in Storage at `attachmentPath`, the thumbnail right here. */
export const attachments = sqliteTable("attachments", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	entry_id: text("entry_id").notNull(),
	/** One of `ATTACHMENT_MEDIA_TYPES`. */
	media_type: text("media_type").notNull(),
	size_bytes: integer("size_bytes").notNull(),
	file_name: text("file_name"),
	/** A small JPEG data URL, for images. */
	thumbnail: text("thumbnail"),
	/** Set once its file was purged (90 days after its Entry was deleted): a restored Entry shows it expired. */
	purged_at: text("purged_at"),
	created_by: text("created_by").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** How a Wallet's statements map onto Entries for CSV import; one per Wallet, Admins only. */
export const importMappings = sqliteTable("import_mappings", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	wallet_id: text("wallet_id").notNull(),
	/** JSON text: an `ImportMapping`, read back with `readMapping`. */
	mapping: text("mapping").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** One Notification in the User's Notification inbox (CONTEXT.md); raised by the server, only marked read here. */
export const notifications = sqliteTable("notifications", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	/** The recipient: always the signed-in User. */
	user_id: text("user_id").notNull(),
	/** One of `NOTIFICATION_TRIGGERS`. */
	trigger: text("trigger").notNull(),
	subject_user_id: text("subject_user_id"),
	/** JSON text of what happened (`readMembershipPayload`); never an amount. */
	payload: text("payload").notNull(),
	created_at: text("created_at").notNull(),
	read_at: text("read_at"),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** Whether a trigger also reaches the User by push in a household; one per trigger, its id from `preferenceId`. */
export const notificationPreferences = sqliteTable("notification_preferences", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	user_id: text("user_id").notNull(),
	trigger: text("trigger").notNull(),
	/** Push. */
	enabled: integer("enabled", { mode: "boolean" }).notNull(),
	/** Email: the Monthly summary only, opt-in (#13); null for every other trigger. */
	email_enabled: integer("email_enabled", { mode: "boolean" }),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** A named set of search and filter criteria, private to the User who saved it (CONTEXT.md). */
export const savedFilters = sqliteTable("saved_filters", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	user_id: text("user_id").notNull(),
	name: text("name").notNull(),
	/** JSON text: `writeSavedCriteria` writes it, `readSavedCriteria` reads it back. */
	criteria: text("criteria").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

export const entries = sqliteTable("entries", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	/** The Wallet whose Balance it changes; for a Transfer, the one the money leaves. */
	wallet_id: text("wallet_id").notNull(),
	/** A Transfer's other Wallet, the one the money arrives in. */
	to_wallet_id: text("to_wallet_id"),
	/** The Loan a principal or Repayment belongs to. */
	loan_id: text("loan_id"),
	/** Shared by a cross-household transfer's two halves (ADR-0003), one in each household; null otherwise. */
	link_id: text("link_id"),
	kind: text("kind", { enum: ENTRY_KINDS }).notNull(),
	/** Exact decimal text: the signed change to the Wallet's Balance. Parse with parseMoney; never SUM it in SQL. */
	amount: text("amount").notNull(),
	/** What a Transfer brings into `to_wallet_id`, in that Wallet's currency; exact decimal text, positive. */
	to_amount: text("to_amount"),
	/** The date in the household's timezone, YYYY-MM-DD. */
	occurred_on: text("occurred_on").notNull(),
	/** Optional wall-clock time in the household's timezone, HH:MM. */
	occurred_time: text("occurred_time"),
	/** The Category of an Expense or Income, from its own list; null for a Balance adjustment. */
	category_id: text("category_id"),
	description: text("description"),
	notes: text("notes"),
	created_by: text("created_by").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** One line of an Expense (CONTEXT.md, Item); the Expense's amount is minus the sum of its Items' amounts. */
export const entryItems = sqliteTable("entry_items", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	entry_id: text("entry_id").notNull(),
	/** The order Items were added in; never reordered. */
	position: integer("position").notNull(),
	description: text("description").notNull(),
	/** Exact decimal text, positive. Parse with parseMoney; never SUM it in SQL. */
	amount: text("amount").notNull(),
	/** Informational only, say "2 kg". */
	quantity: text("quantity"),
	category_id: text("category_id").notNull(),
	/** The Rest (CONTEXT.md): what the other Items left of the receipt total, saved as "Other <category>". */
	rest: integer("rest", { mode: "boolean" }).notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});

/** The one global row: the minimum contract version the server accepts writes from (ADR-0009). */
export const appConfig = sqliteTable("app_config", {
	id: text("id").primaryKey(),
	min_contract_version: integer("min_contract_version").notNull(),
});

// Local-only: never synced. Rejected changes, shown as "couldn't sync" items (ADR-0007).
export const uploadErrors = sqliteTable("upload_errors", {
	id: text("id").primaryKey(),
	/** The synced table the write targeted. */
	table_name: text("table_name").notNull(),
	row_id: text("row_id").notNull(),
	/** PowerSync's operation: PUT, PATCH or DELETE. */
	op: text("op", { enum: ["PUT", "PATCH", "DELETE"] }).notNull(),
	/** The Postgres error code, or `NO_ROWS` (see rejected-changes.ts). */
	code: text("code").notNull(),
	message: text("message").notNull(),
	/** What was sent, as JSON: the whole row for PUT and PATCH, nothing for DELETE. */
	data: text("data"),
	created_at: text("created_at").notNull(),
});

/**
 * Local-only: what this device remembers between launches, in one row (`DEVICE_STATE_ID`). Cleared with the
 * rest of the local database on sign-out.
 */
export const deviceState = sqliteTable("device_state", {
	id: text("id").primaryKey(),
	/** The household last switched to here; the Personal household when it's null or no longer the User's. */
	current_household_id: text("current_household_id"),
	/** The Invite someone arrived by, kept through sign-in and naming themselves until they've joined. */
	pending_invite_token: text("pending_invite_token"),
	/** That Invite's household, once accepted; onboarding waits for its Membership to sync. */
	pending_invite_household_id: text("pending_invite_household_id"),
});

export const DEVICE_STATE_ID = "device";

/** An Admin's Invite (spec §3.1); synced to the household's Admins only, since its token is the link. */
export const invites = sqliteTable("invites", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	/** The secret the link carries (`encodeInviteToken`). */
	token: text("token").notNull(),
	role: text("role", { enum: ROLES }).notNull(),
	/** Normalized (`normalizeEmail`); null when anyone with the link may accept. */
	email: text("email"),
	expires_at: text("expires_at").notNull(),
	revoked_at: text("revoked_at"),
	accepted_by: text("accepted_by"),
	accepted_at: text("accepted_at"),
	created_by: text("created_by").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
	_deleted: deleteFlag(),
});
