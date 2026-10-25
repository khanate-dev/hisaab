import { createConnector } from "@hisaab/app/connector";
import { schema } from "@hisaab/client-schema";
import type {
	AbstractPowerSyncDatabase,
	PowerSyncBackendConnector,
} from "@powersync/common";
import { PowerSyncDatabase } from "@powersync/node";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, onTestFinished, vi } from "vitest";

import { stack } from "./stack";
import { type SignedInUser, userClient } from "./users";

/** Opens a PowerSync sync stream with the token, returning the status and any error body. */
export const openSyncStream = async (token: string) => {
	const response = await fetch(`${stack.powersyncUrl}/sync/stream`, {
		method: "POST",
		headers: {
			Authorization: `Token ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({}),
	});
	if (!response.ok)
		return { status: response.status, body: await response.text() };
	// A healthy stream never ends on its own; the status is all we need.
	await response.body?.cancel();
	return { status: response.status, body: "" };
};

/**
 * Connects a @powersync/node client as the User, resolved once the first sync completes.
 * Call it inside a test: the client is closed and its database directory removed when the test finishes.
 */
export const connectClient = async (user: SignedInUser) => {
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
	// The connector the app ships, writing through RLS as this User.
	const connector = createConnector({
		supabase: userClient(user),
		powersyncUrl: stack.powersyncUrl,
		getToken: async () => user.accessToken,
	});
	connectors.set(db, connector);
	await db.connect(connector);
	await db.waitForFirstSync();
	return db;
};

const connectors = new WeakMap<
	AbstractPowerSyncDatabase,
	PowerSyncBackendConnector
>();

/** Stops syncing: local writes queue up until the client goes online again. */
export const goOffline = (db: AbstractPowerSyncDatabase) => db.disconnect();

export const goOnline = async (db: AbstractPowerSyncDatabase) => {
	const connector = connectors.get(db);
	if (!connector) throw new Error("goOnline needs a client from connectClient");
	await db.connect(connector);
};

/** Resolves once every queued local write has been uploaded (or rejected). */
export const waitForUploads = (db: AbstractPowerSyncDatabase) =>
	vi.waitFor(
		async () => expect((await db.getUploadQueueStats()).count).toBe(0),
		{ timeout: 15_000 },
	);
