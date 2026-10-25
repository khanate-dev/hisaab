import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
