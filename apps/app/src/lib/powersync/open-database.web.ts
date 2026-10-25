import { schema } from "@hisaab/client-schema";
import { PowerSyncDatabase } from "@powersync/web";

// The worker is copied into public/ by `pnpm prepare:web`; it runs both the database and the sync client.
const worker = "/@powersync/worker.js";

export const openDatabase = () =>
	new PowerSyncDatabase({
		schema,
		database: { dbFilename: "hisaab.db", worker },
		sync: { worker },
	});

export const connectOptions = {};
