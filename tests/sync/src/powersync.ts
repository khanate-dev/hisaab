import { schema } from "@hisaab/client-schema";
import { PowerSyncDatabase } from "@powersync/node";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

import { stack } from "./stack";
import type { SignedInUser } from "./users";

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
	await db.connect({
		fetchCredentials: async () => ({
			endpoint: stack.powersyncUrl,
			token: user.accessToken,
		}),
		// Uploads arrive with the shared upload connector (#25); nothing writes locally yet.
		uploadData: async () => {},
	});
	await db.waitForFirstSync();
	return db;
};
