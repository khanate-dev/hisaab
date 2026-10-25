import { Schema } from "@powersync/common";

import { toPowerSyncTable } from "./powersync-schema";
import * as tables from "./tables";

export * from "./contract-version";
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
	households: toPowerSyncTable(tables.households),
	memberships: toPowerSyncTable(tables.memberships),
	upload_errors: toPowerSyncTable(tables.uploadErrors, { localOnly: true }),
});
