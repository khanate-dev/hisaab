import { AttachmentTable, Schema } from "@powersync/common";

import { toPowerSyncTable } from "./powersync-schema";
import * as tables from "./tables";

export * from "./contract-version";
export * from "./kinds";
export * from "./rejected-changes";
export * from "./roles";
export * from "./stamp";
export * from "./tables";

/** The local-only table PowerSync's AttachmentQueue keeps its state in. */
export const ATTACHMENT_QUEUE_TABLE = "attachment_queue";

/** Drizzle tables, for `wrapPowerSyncWithDrizzle` and queries. */
export const drizzleSchema = tables;

// Hand-written PowerSync schema (the synced subset plus local-only tables), derived from the Drizzle tables.
// Keys are the SQLite table names. Never generated from Postgres.
export const schema = new Schema({
	app_config: toPowerSyncTable(tables.appConfig),
	attachments: toPowerSyncTable(tables.attachments),
	budget_overrides: toPowerSyncTable(tables.budgetOverrides),
	budgets: toPowerSyncTable(tables.budgets),
	categories: toPowerSyncTable(tables.categories),
	contacts: toPowerSyncTable(tables.contacts),
	entries: toPowerSyncTable(tables.entries),
	entry_items: toPowerSyncTable(tables.entryItems),
	households: toPowerSyncTable(tables.households),
	import_mappings: toPowerSyncTable(tables.importMappings),
	invites: toPowerSyncTable(tables.invites),
	loans: toPowerSyncTable(tables.loans),
	memberships: toPowerSyncTable(tables.memberships),
	notification_deliveries: toPowerSyncTable(tables.notificationDeliveries),
	notification_preferences: toPowerSyncTable(tables.notificationPreferences),
	occurrences: toPowerSyncTable(tables.occurrences),
	profiles: toPowerSyncTable(tables.profiles),
	recurring_rules: toPowerSyncTable(tables.recurringRules),
	saved_filters: toPowerSyncTable(tables.savedFilters),
	wallets: toPowerSyncTable(tables.wallets),
	upload_errors: toPowerSyncTable(tables.uploadErrors, { localOnly: true }),
	device_state: toPowerSyncTable(tables.deviceState, { localOnly: true }),
	// The upload queue for Attachment files (PowerSync's AttachmentQueue); named apart from the synced `attachments`.
	[ATTACHMENT_QUEUE_TABLE]: new AttachmentTable({
		viewName: ATTACHMENT_QUEUE_TABLE,
	}),
});
