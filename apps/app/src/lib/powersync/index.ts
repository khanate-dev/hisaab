import { drizzleSchema } from "@hisaab/client-schema";
import type { PowerSyncBackendConnector } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";

import { env } from "../env";
import { supabase } from "../supabase";
import { connectOptions, openDatabase } from "./open-database";

export const powersync = openDatabase();

/** Drizzle over the local PowerSync database; read it through watched queries. */
export const db = wrapPowerSyncWithDrizzle(powersync, {
	schema: drizzleSchema,
});

const connector: PowerSyncBackendConnector = {
	fetchCredentials: async () => {
		const { data } = await supabase.auth.getSession();
		if (!data.session) return null;
		return { endpoint: env.powersyncUrl, token: data.session.access_token };
	},
	// The upload connector arrives in #25; nothing writes locally yet.
	uploadData: async () => {},
};

export const startSync = () => powersync.connect(connector, connectOptions);

/** Signing out wipes the local replica, so the next User never sees the previous one's data. */
export const stopSync = () => powersync.disconnectAndClear();
