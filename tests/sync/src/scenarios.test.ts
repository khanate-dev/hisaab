import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import {
	connectClient,
	goOffline,
	goOnline,
	waitForUploads,
} from "./powersync";
import { seedHousehold } from "./seed";
import { adminClient } from "./users";

// Offline and conflict scenarios (ADR-0010), driven through the upload connector the app ships.

const serverName = async (household: string) => {
	const { data, error } = await adminClient()
		.from("households")
		.select("name")
		.eq("id", household)
		.maybeSingle();
	if (error) throw error;
	return data?.name;
};

const localName = async (
	device: AbstractPowerSyncDatabase,
	household: string,
) =>
	(
		await device.getOptional<{ name: string }>(
			"SELECT name FROM households WHERE id = ?",
			[household],
		)
	)?.name;

const rename = (
	device: AbstractPowerSyncDatabase,
	household: string,
	name: string,
) =>
	device.execute("UPDATE households SET name = ? WHERE id = ?", [
		name,
		household,
	]);

const uploadErrors = (device: AbstractPowerSyncDatabase) =>
	device.getAll<{
		table_name: string;
		row_id: string;
		op: string;
		code: string;
	}>("SELECT table_name, row_id, op, code FROM upload_errors");

describe("sync scenarios", () => {
	it("last writer wins per row, in server-arrival order", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			bob: "admin",
		});
		const alice = await connectClient(users.alice);
		const bob = await connectClient(users.bob);

		await goOffline(alice);
		await goOffline(bob);
		await rename(alice, household, "Alice's name");
		await rename(bob, household, "Bob's name");

		await goOnline(alice);
		await waitForUploads(alice);
		await goOnline(bob);
		await waitForUploads(bob);

		expect(await serverName(household)).toBe("Bob's name");
		await vi.waitFor(
			async () => expect(await localName(alice, household)).toBe("Bob's name"),
			{ timeout: 10_000 },
		);
		expect(await uploadErrors(alice)).toEqual([]);
		expect(await uploadErrors(bob)).toEqual([]);
	});

	it("an update that arrives after a delete is a rejection, and the row is gone everywhere", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			bob: "admin",
		});
		const alice = await connectClient(users.alice);
		const bob = await connectClient(users.bob);

		await goOffline(bob);
		await rename(bob, household, "Renamed offline");
		await alice.execute("DELETE FROM households WHERE id = ?", [household]);
		await waitForUploads(alice);
		expect(await serverName(household)).toBeUndefined();

		await goOnline(bob);
		await waitForUploads(bob);

		expect(await uploadErrors(bob)).toEqual([
			{
				table_name: "households",
				row_id: household,
				op: "PATCH",
				code: "no_rows",
			},
		]);
		await vi.waitFor(
			async () => expect(await localName(bob, household)).toBeUndefined(),
			{ timeout: 10_000 },
		);
	});

	it("a write RLS rejects while offline is kept as a couldn't-sync item and reverted", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			carol: "viewer",
		});
		const carol = await connectClient(users.carol);

		await goOffline(carol);
		await rename(carol, household, "Viewer's name");
		await goOnline(carol);
		await waitForUploads(carol);

		expect(await serverName(household)).toBe("Family");
		expect(await uploadErrors(carol)).toEqual([
			{
				table_name: "households",
				row_id: household,
				op: "PATCH",
				code: "no_rows",
			},
		]);
		await vi.waitFor(
			async () => expect(await localName(carol, household)).toBe("Family"),
			{ timeout: 10_000 },
		);
	});

	it("an insert RLS rejects while offline carries the Postgres error code and disappears", async () => {
		const { users } = await seedHousehold({ carol: "viewer" });
		const carol = await connectClient(users.carol);

		await goOffline(carol);
		const id = uuidv7();
		await carol.execute(
			"INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)",
			[id, "Sneaky", new Date().toISOString()],
		);
		await goOnline(carol);
		await waitForUploads(carol);

		expect(await uploadErrors(carol)).toEqual([
			{ table_name: "households", row_id: id, op: "PUT", code: "42501" },
		]);
		await vi.waitFor(
			async () => expect(await localName(carol, id)).toBeUndefined(),
			{ timeout: 10_000 },
		);
	});

	it("a delete RLS rejects while offline is a couldn't-sync item and the row comes back", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			bob: "member",
		});
		const bob = await connectClient(users.bob);

		await goOffline(bob);
		await bob.execute("DELETE FROM households WHERE id = ?", [household]);
		await goOnline(bob);
		await waitForUploads(bob);

		expect(await serverName(household)).toBe("Family");
		expect(await uploadErrors(bob)).toEqual([
			{
				table_name: "households",
				row_id: household,
				op: "DELETE",
				code: "no_rows",
			},
		]);
		await vi.waitFor(
			async () => expect(await localName(bob, household)).toBe("Family"),
			{ timeout: 10_000 },
		);
	});
});
