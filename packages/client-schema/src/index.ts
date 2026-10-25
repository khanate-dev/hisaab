import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import * as tables from "./tables";

export * from "./tables";

/** Drizzle tables, for `wrapPowerSyncWithDrizzle` and queries. */
export const drizzleSchema = tables;

// Hand-written PowerSync schema (the synced subset plus local-only tables), derived from the Drizzle tables.
// Never generated from Postgres.
export const schema = new DrizzleAppSchema(drizzleSchema);
