import { drizzleSchema } from "@hisaab/client-schema";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";

import { env } from "../env";
import { supabase } from "../supabase";
import { createConnector } from "./connector";
import { connectOptions, openDatabase } from "./open-database";

export const powersync = openDatabase();

/** Drizzle over the local PowerSync database; read it through watched queries. */
export const db = wrapPowerSyncWithDrizzle(powersync, {
	schema: drizzleSchema,
});

const connector = createConnector({
	supabase,
	powersyncUrl: env.powersyncUrl,
	getToken: async () =>
		(await supabase.auth.getSession()).data.session?.access_token ?? null,
});

export const startSync = () => powersync.connect(connector, connectOptions);

/** Signing out wipes the local replica, so the next User never sees the previous one's data. */
export const stopSync = () => powersync.disconnectAndClear();
