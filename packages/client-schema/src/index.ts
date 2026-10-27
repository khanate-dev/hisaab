import { Schema } from "@powersync/common";

import { toPowerSyncTable } from "./powersync-schema";
import * as tables from "./tables";

export * from "./contract-version";
export * from "./kinds";
export * from "./rejected-changes";
export * from "./roles";
export * from "./stamp";
export * from "./tables";

/** Drizzle tables, for `wrapPowerSyncWithDrizzle` and queries. */
export const drizzleSchema = tables;

// Hand-written PowerSync schema (the synced subset plus local-only tables), derived from the Drizzle tables.
// Keys are the SQLite table names. Never generated from Postgres.
export const schema = new Schema({
	app_config: toPowerSyncTable(tables.appConfig),
	budget_overrides: toPowerSyncTable(tables.budgetOverrides),
	budgets: toPowerSyncTable(tables.budgets),
	categories: toPowerSyncTable(tables.categories),
	contacts: toPowerSyncTable(tables.contacts),
	entries: toPowerSyncTable(tables.entries),
	entry_items: toPowerSyncTable(tables.entryItems),
	households: toPowerSyncTable(tables.households),
	invites: toPowerSyncTable(tables.invites),
	loans: toPowerSyncTable(tables.loans),
	memberships: toPowerSyncTable(tables.memberships),
	occurrences: toPowerSyncTable(tables.occurrences),
	profiles: toPowerSyncTable(tables.profiles),
	recurring_rules: toPowerSyncTable(tables.recurringRules),
	wallets: toPowerSyncTable(tables.wallets),
	upload_errors: toPowerSyncTable(tables.uploadErrors, { localOnly: true }),
	device_state: toPowerSyncTable(tables.deviceState, { localOnly: true }),
});
