import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { ROLES } from "./roles";

// Synced tables mirror their Sync Streams columns (powersync/sync-config.yaml), not the Postgres tables.

export const households = sqliteTable("households", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	/** Set only on a Personal household: the User it belongs to. */
	personal_user_id: text("personal_user_id"),
	created_at: text("created_at").notNull(),
});

export const memberships = sqliteTable("memberships", {
	id: text("id").primaryKey(),
	household_id: text("household_id").notNull(),
	user_id: text("user_id").notNull(),
	role: text("role", { enum: ROLES }).notNull(),
	created_at: text("created_at").notNull(),
});
