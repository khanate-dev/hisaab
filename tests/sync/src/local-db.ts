import { schema } from "@hisaab/client-schema";
import { PowerSyncDatabase } from "@powersync/node";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

/**
 * A fresh on-disk PowerSync database with the app's client schema, not connected to anything.
 * Call it inside a test: it is closed and its directory removed when the test finishes.
 */
export const openLocalDatabase = () => {
	const dbLocation = mkdtempSync(join(tmpdir(), "hisaab-sync-"));
	const db = new PowerSyncDatabase({
		schema,
		// Unique per client: PowerSync keys its connection locks by file name, so two clients sharing one stall.
		database: { dbFilename: `${crypto.randomUUID()}.db`, dbLocation },
	});
	onTestFinished(async () => {
		await db.disconnectAndClear();
		await db.close();
		rmSync(dbLocation, { recursive: true, force: true });
	});
	return db;
};
