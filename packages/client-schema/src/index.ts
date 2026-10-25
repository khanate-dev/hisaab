import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import * as tables from "./tables";

export * from "./roles";
export * from "./tables";

/** Drizzle tables, for `wrapPowerSyncWithDrizzle` and queries. */
export const drizzleSchema = tables;

// Hand-written PowerSync schema (the synced subset plus local-only tables), derived from the Drizzle tables.
// Keys are the SQLite table names. Never generated from Postgres.
export const schema = new DrizzleAppSchema({
	households: tables.households,
	memberships: tables.memberships,
	upload_errors: {
		tableDefinition: tables.uploadErrors,
		options: { localOnly: true },
	},
});
