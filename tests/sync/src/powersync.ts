import { createConnector } from "@hisaab/app/connector";
import { CONTRACT_VERSION } from "@hisaab/client-schema";
import type {
	AbstractPowerSyncDatabase,
	PowerSyncBackendConnector,
} from "@powersync/common";
import { expect, vi } from "vitest";

import { openLocalDatabase } from "./local-db";
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
 */
/** `contractVersion` plays an app build of that version; it defaults to this build. */
export const connectClient = async (
	user: SignedInUser,
	contractVersion = CONTRACT_VERSION,
) => {
	const db = openLocalDatabase();
	// The connector the app ships, writing through RLS as this User.
	const connector = connectorFor(user, contractVersion);
	connectors.set(db, connector);
	await db.connect(connector);
	await db.waitForFirstSync();
	return db;
};

const connectorFor = (user: SignedInUser, contractVersion: number) =>
	createConnector({
		supabase: userClient(user, contractVersion),
		powersyncUrl: stack.powersyncUrl,
		getToken: async () => user.accessToken,
	});

/** Installs a newer build: the same local database and queue, a connector speaking `contractVersion`. */
export const updateApp = async (
	db: AbstractPowerSyncDatabase,
	user: SignedInUser,
	contractVersion = CONTRACT_VERSION,
) => {
	await db.disconnect();
	const connector = connectorFor(user, contractVersion);
	connectors.set(db, connector);
	await db.connect(connector);
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
