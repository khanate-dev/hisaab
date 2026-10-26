import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { CATEGORY_KINDS, ENTRY_KINDS, WALLET_TYPES } from "./kinds";
import { ROLES } from "./roles";
import { STAMP_COLUMN } from "./stamp";

// Synced tables mirror their Sync Streams columns (powersync/sync-config.yaml), not the Postgres tables.

/**
 * Write-only: the contract version a local write was made under, which PowerSync attaches to the queued op
 * (ADR-0009). Set it with `stamped()`; it never syncs and is never uploaded as a column.
 */
const contractStamp = () => text(STAMP_COLUMN);

export const households = sqliteTable("households", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	/** Set only on a Personal household: the User it belongs to. */
	personal_user_id: text("personal_user_id"),
	/** ISO 4217; set by First Wallet onboarding and fixed once the household has an Entry (ADR-0005). */
	base_currency: text("base_currency"),
	/** IANA; Entry dates are in it. Set by onboarding from the device; null means "use the device's". */
	timezone: text("timezone"),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
});

export const memberships = sqliteTable("memberships", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	user_id: text("user_id").notNull(),
	role: text("role", { enum: ROLES }).notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
});

/** A User's name, shown to the people they share a household with. */
export const profiles = sqliteTable("profiles", {
	id: text("id").primaryKey(),
	display_name: text("display_name").notNull(),
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
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
});

export const entries = sqliteTable("entries", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	wallet_id: text("wallet_id").notNull(),
	kind: text("kind", { enum: ENTRY_KINDS }).notNull(),
	/** Exact decimal text: the signed change to the Wallet's Balance. Parse with parseMoney; never SUM it in SQL. */
	amount: text("amount").notNull(),
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
	created_at: text("created_at").notNull(),
	_metadata: contractStamp(),
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
