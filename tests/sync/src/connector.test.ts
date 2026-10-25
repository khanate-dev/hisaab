import { createConnector } from "@hisaab/app/connector";
import { stamped } from "@hisaab/client-schema";
import type { Upcasters } from "@hisaab/domain";
import type { AbstractPowerSyncDatabase } from "@powersync/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it } from "vitest";

import { openLocalDatabase } from "./local-db";

// The shipped connector against a real local PowerSync queue, with a scripted server for cases the stack can't force.

type Call = {
	table: string;
	action: "upsert" | "update" | "delete" | "select";
	id?: unknown;
	values?: unknown;
};
type Reply = {
	data: { id: string }[] | null;
	error: { code: string; message: string } | null;
};

type Build = {
	contractVersion?: number;
	upcasters?: Upcasters;
	onUpdateRequired?: () => void;
};

const scriptedServer = (
	reply: (call: Call) => Reply,
	{ onUpdateRequired, contractVersion, upcasters }: Build = {},
) => {
	const calls: Call[] = [];
	const from = (table: string) => {
		const call: Call = { table, action: "select" };
		const query = {
			upsert: (values: { id: string }) =>
				Object.assign(call, { action: "upsert", values, id: values.id }) &&
				query,
			update: (values: unknown) =>
				Object.assign(call, { action: "update", values }) && query,
			delete: () => Object.assign(call, { action: "delete" }) && query,
			select: () => query,
			eq: (_column: string, value: unknown) =>
				Object.assign(call, { id: value }) && query,
			then: (
				resolve: (reply: Reply) => unknown,
				reject: (error: unknown) => unknown,
			) => {
				calls.push({ ...call });
				return Promise.resolve(reply(call)).then(resolve, reject);
			},
		};
		return query;
	};
	const connector = createConnector({
		supabase: { from } as unknown as SupabaseClient,
		powersyncUrl: "http://unused",
		getToken: async () => "token",
		...(onUpdateRequired && { onUpdateRequired }),
		...(contractVersion !== undefined && { contractVersion }),
		...(upcasters && { upcasters }),
	});
	return {
		calls,
		upload: (db: AbstractPowerSyncDatabase) => connector.uploadData(db),
	};
};

const ok = (call: Call): Reply => ({
	data: [{ id: String(call.id) }],
	error: null,
});
const failure = (code: string): Reply => ({
	data: null,
	error: { code, message: code },
});

const insertHousehold = (db: AbstractPowerSyncDatabase, id = uuidv7()) =>
	db
		.execute(
			"INSERT INTO households (id, name, created_at) VALUES (?, 'Family', ?)",
			[id, new Date().toISOString()],
		)
		.then(() => id);

const rejectedChanges = (db: AbstractPowerSyncDatabase) =>
	db.getAll<{ row_id: string; op: string; code: string }>(
		"SELECT row_id, op, code FROM upload_errors",
	);

const queued = async (db: AbstractPowerSyncDatabase) =>
	(await db.getUploadQueueStats()).count;

describe("upload connector", () => {
	it.each([
		"PGRST000",
		"PGRST003",
		"PGRST301",
		"42703",
		"42P01",
		"PGRST204",
		"08006",
	])("keeps the write queued for a retry on %s", async (code) => {
		const db = openLocalDatabase();
		await insertHousehold(db);
		const server = scriptedServer(() => failure(code));

		await expect(server.upload(db)).rejects.toMatchObject({ code });
		expect(await queued(db)).toBe(1);
		expect(await rejectedChanges(db)).toEqual([]);
	});

	it("pauses on 426 and reports that an update is required, without a rejected change", async () => {
		const db = openLocalDatabase();
		await insertHousehold(db);
		let updateRequired = 0;
		const server = scriptedServer(() => failure("PT426"), {
			onUpdateRequired: () => (updateRequired += 1),
		});

		await expect(server.upload(db)).rejects.toMatchObject({ code: "PT426" });
		expect(updateRequired).toBe(1);
		expect(await queued(db)).toBe(1);
		expect(await rejectedChanges(db)).toEqual([]);

		// Paused, not retried: later attempts stop before the network until the app is updated.
		await expect(server.upload(db)).rejects.toThrow(/update required/i);
		expect(server.calls).toHaveLength(1);
		expect(await queued(db)).toBe(1);
	});

	it.each(["42501", "23505", "22P02"])(
		"records %s as a change that couldn't sync",
		async (code) => {
			const db = openLocalDatabase();
			const id = await insertHousehold(db);
			const server = scriptedServer(() => failure(code));

			await server.upload(db);
			expect(await queued(db)).toBe(0);
			expect(await rejectedChanges(db)).toEqual([
				{ row_id: id, op: "PUT", code },
			]);
		},
	);

	it("records each rejection once when a transaction is retried after a transient failure", async () => {
		const db = openLocalDatabase();
		let first = "";
		await db.writeTransaction(async (tx) => {
			first = uuidv7();
			await tx.execute(
				"INSERT INTO households (id, name, created_at) VALUES (?, 'A', ?)",
				[first, "2026-01-01"],
			);
			await tx.execute(
				"INSERT INTO households (id, name, created_at) VALUES (?, 'B', ?)",
				[uuidv7(), "2026-01-01"],
			);
		});
		let attempt = 0;
		const server = scriptedServer((call) => {
			if (call.id === first) return failure("42501");
			attempt += 1;
			return attempt === 1 ? failure("PGRST000") : ok(call);
		});

		await expect(server.upload(db)).rejects.toBeDefined();
		await server.upload(db);

		expect(await queued(db)).toBe(0);
		expect(await rejectedChanges(db)).toEqual([
			{ row_id: first, op: "PUT", code: "42501" },
		]);
	});

	it("treats a delete whose row is already gone from the server as done", async () => {
		const db = openLocalDatabase();
		const id = await insertHousehold(db);
		await db.execute("DELETE FROM ps_crud");
		await db.execute("DELETE FROM households WHERE id = ?", [id]);
		const server = scriptedServer((call) =>
			call.action === "delete" || call.action === "select"
				? { data: [], error: null }
				: ok(call),
		);

		await server.upload(db);
		expect(await queued(db)).toBe(0);
		expect(await rejectedChanges(db)).toEqual([]);
	});

	it("rejects a delete the server refused while the row is still there", async () => {
		const db = openLocalDatabase();
		const id = await insertHousehold(db);
		await db.execute("DELETE FROM ps_crud");
		await db.execute("DELETE FROM households WHERE id = ?", [id]);
		const server = scriptedServer((call) =>
			call.action === "delete" ? { data: [], error: null } : ok(call),
		);

		await server.upload(db);
		expect(await rejectedChanges(db)).toEqual([
			{ row_id: id, op: "DELETE", code: "no_rows" },
		]);
	});

	it("sends an update as the whole local row", async () => {
		const db = openLocalDatabase();
		const id = await insertHousehold(db);
		await db.execute("DELETE FROM ps_crud");
		await db.execute("UPDATE households SET name = 'Home' WHERE id = ?", [id]);
		const server = scriptedServer(ok);

		await server.upload(db);
		expect(server.calls).toEqual([
			{
				table: "households",
				action: "update",
				id,
				values: {
					name: "Home",
					personal_user_id: null,
					base_currency: null,
					created_at: expect.any(String),
				},
			},
		]);
	});

	it("skips an update whose row was deleted locally before it uploaded", async () => {
		const db = openLocalDatabase();
		const id = await insertHousehold(db);
		await db.execute("DELETE FROM ps_crud");
		await db.execute("UPDATE households SET name = 'Home' WHERE id = ?", [id]);
		await db.execute("DELETE FROM households WHERE id = ?", [id]);
		const server = scriptedServer(ok);

		await server.upload(db);
		await server.upload(db);
		expect(server.calls.map((call) => call.action)).toEqual(["delete"]);
	});

	describe("contract versions (ADR-0009)", () => {
		const insertStamped = async (
			db: AbstractPowerSyncDatabase,
			contractVersion: number,
		) => {
			const row = stamped(
				{ id: uuidv7(), name: "Family", created_at: "2026-01-01" },
				contractVersion,
			);
			await db.execute(
				"INSERT INTO households (id, name, created_at, _metadata) VALUES (?, ?, ?, ?)",
				[row.id, row.name, row.created_at, row._metadata],
			);
			return row.id;
		};

		it("runs an op queued by an older build through the upcaster chain", async () => {
			const db = openLocalDatabase();
			await insertStamped(db, 1);
			const server = scriptedServer(ok, {
				contractVersion: 3,
				upcasters: {
					2: (op) => ({
						...op,
						data: { ...op.data, name: `${op.data?.["name"]} v2` },
					}),
					3: (op) => ({
						...op,
						data: { ...op.data, name: `${op.data?.["name"]} v3` },
					}),
				},
			});

			await server.upload(db);
			expect(server.calls).toEqual([
				expect.objectContaining({
					action: "upsert",
					values: expect.objectContaining({ name: "Family v2 v3" }),
				}),
			]);
		});

		it("keeps an op the chain can't map as a rejected change, without sending it", async () => {
			const db = openLocalDatabase();
			const id = await insertStamped(db, 1);
			const server = scriptedServer(ok, { contractVersion: 2, upcasters: {} });

			await server.upload(db);
			expect(server.calls).toEqual([]);
			expect(await queued(db)).toBe(0);
			expect(await rejectedChanges(db)).toEqual([
				{ row_id: id, op: "PUT", code: "unmappable" },
			]);
		});

		it("never uploads the stamp itself", async () => {
			const db = openLocalDatabase();
			const id = await insertStamped(db, 1);
			await db.execute("DELETE FROM ps_crud");
			await db.execute(
				"UPDATE households SET name = 'Home', _metadata = ? WHERE id = ?",
				[stamped({}, 1)._metadata, id],
			);
			const server = scriptedServer(ok);

			await server.upload(db);
			expect(server.calls).toEqual([
				{
					table: "households",
					action: "update",
					id,
					values: {
						name: "Home",
						personal_user_id: null,
						base_currency: null,
						created_at: "2026-01-01",
					},
				},
			]);
		});

		it("treats an unstamped op as written by this build", async () => {
			const db = openLocalDatabase();
			await insertHousehold(db);
			const server = scriptedServer(ok, { contractVersion: 2, upcasters: {} });

			await server.upload(db);
			expect(server.calls).toHaveLength(1);
			expect(await rejectedChanges(db)).toEqual([]);
		});
	});
});
