import { schema } from "@hisaab/client-schema";
import { PowerSyncDatabase } from "@powersync/node";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";

// Keys come from the running local stack, so the secret key is never committed.
const readSupabaseStatus = () => {
	try {
		return JSON.parse(
			execFileSync("pnpm", ["exec", "supabase", "status", "--output", "json"], {
				cwd: fileURLToPath(new URL("../../..", import.meta.url)),
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}),
		) as Record<"API_URL" | "PUBLISHABLE_KEY" | "SECRET_KEY", string>;
	} catch (cause) {
		throw new Error(
			"The local stack isn't running; start it with `pnpm stack:up`.",
			{ cause },
		);
	}
};
const status = readSupabaseStatus();

export const stack = {
	supabaseUrl: status.API_URL,
	publishableKey: status.PUBLISHABLE_KEY,
	secretKey: status.SECRET_KEY,
	powersyncUrl: process.env["POWERSYNC_URL"] ?? "http://localhost:55380",
};

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Creates a fresh user and signs them in through the email OTP flow, returning their access token. */
export const signInNewUser = async () => {
	const admin = createClient(stack.supabaseUrl, stack.secretKey, noSession);
	const email = `user-${crypto.randomUUID()}@example.com`;

	const created = await admin.auth.admin.createUser({
		email,
		email_confirm: true,
	});
	if (created.error) throw created.error;
	const link = await admin.auth.admin.generateLink({
		type: "magiclink",
		email,
	});
	if (link.error) throw link.error;

	const client = createClient(
		stack.supabaseUrl,
		stack.publishableKey,
		noSession,
	);
	const verified = await client.auth.verifyOtp({
		email,
		token: link.data.properties.email_otp,
		type: "email",
	});
	if (verified.error) throw verified.error;
	if (!verified.data.session) throw new Error("verifyOtp returned no session");
	return verified.data.session.access_token;
};

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
 * Signs in a fresh user and connects a @powersync/node client for them, resolved once the first sync completes.
 * Call it inside a test: the client is closed and its database directory removed when the test finishes.
 */
export const connectClient = async () => {
	const token = await signInNewUser();
	const dbLocation = mkdtempSync(join(tmpdir(), "hisaab-sync-"));
	const db = new PowerSyncDatabase({
		schema,
		database: { dbFilename: "client.db", dbLocation },
	});
	onTestFinished(async () => {
		await db.disconnectAndClear();
		await db.close();
		rmSync(dbLocation, { recursive: true, force: true });
	});
	await db.connect({
		fetchCredentials: async () => ({ endpoint: stack.powersyncUrl, token }),
		// Uploads arrive with the shared upload connector (#25); nothing writes locally yet.
		uploadData: async () => {},
	});
	await db.waitForFirstSync();
	return db;
};
