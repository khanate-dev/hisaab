import { CONTRACT_VERSION, stamped } from "@hisaab/client-schema";
import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import {
	connectClient,
	goOffline,
	goOnline,
	updateApp,
	waitForUploads,
} from "./powersync";
import { seedHousehold } from "./seed";
import { adminClient, signInNewUser } from "./users";

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

/** Renames as the app does: the write is stamped with the contract version of the build making it. */
const rename = (
	device: AbstractPowerSyncDatabase,
	household: string,
	name: string,
	contractVersion = CONTRACT_VERSION,
) =>
	device.execute("UPDATE households SET name = ?, _metadata = ? WHERE id = ?", [
		name,
		stamped({}, contractVersion)._metadata,
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

	it("a too-old build still downloads, and its writes wait out the 426s until the app is updated", async () => {
		const { users, household } = await seedHousehold({ alice: "admin" });
		const alice = await connectClient(users.alice, { contractVersion: 0 });
		// Downloads aren't gated; the seeded row may land just after the first sync, so wait for it.
		await vi.waitFor(
			async () => expect(await localName(alice, household)).toBe("Family"),
			{ timeout: 10_000 },
		);

		await rename(alice, household, "Renamed by an old build", 0);
		await vi.waitFor(
			() =>
				expect(alice.currentStatus.dataFlowStatus.uploadError).toBeDefined(),
			{
				timeout: 15_000,
			},
		);
		expect((await alice.getUploadQueueStats()).count).toBe(1);
		expect(await uploadErrors(alice)).toEqual([]);
		expect(await serverName(household)).toBe("Family");

		await updateApp(alice, users.alice);
		await waitForUploads(alice);
		expect(await serverName(household)).toBe("Renamed by an old build");
		expect(await uploadErrors(alice)).toEqual([]);
	});

	it("an op queued by an older build is upcast by the newer one before it uploads", async () => {
		const { users, household } = await seedHousehold({ alice: "admin" });
		const alice = await connectClient(users.alice);

		await goOffline(alice);
		await rename(alice, household, "Home", 1);
		// The update speaks contract version 3, and its chain maps a version 1 op through 2 and 3.
		await updateApp(alice, users.alice, {
			contractVersion: 3,
			upcasters: {
				2: (op) => ({
					...op,
					data: { ...op.data, name: `${op.data?.["name"]} (v2)` },
				}),
				3: (op) => ({
					...op,
					data: { ...op.data, name: `${op.data?.["name"]} (v3)` },
				}),
			},
		});
		await waitForUploads(alice);

		expect(await serverName(household)).toBe("Home (v2) (v3)");
		expect(await uploadErrors(alice)).toEqual([]);
	});

	it("an op the newer build's chain can't map is kept as a couldn't-sync item", async () => {
		const { users, household } = await seedHousehold({ alice: "admin" });
		const alice = await connectClient(users.alice);

		await goOffline(alice);
		await rename(alice, household, "Home", 1);
		await updateApp(alice, users.alice, {
			contractVersion: 2,
			upcasters: { 2: () => null },
		});
		await waitForUploads(alice);

		expect(await serverName(household)).toBe("Family");
		expect(await uploadErrors(alice)).toEqual([
			{
				table_name: "households",
				row_id: household,
				op: "PATCH",
				code: "unmappable",
			},
		]);
	});

	it("First Wallet onboarding uploads the Base currency, the Wallet and an exact opening balance", async () => {
		const user = await signInNewUser();
		const device = await connectClient(user);
		// The trigger-made Personal household may land just after the first sync.
		const personal = await vi.waitFor(
			() =>
				device.get<{ id: string }>(
					"SELECT id FROM households WHERE personal_user_id = ?",
					[user.id],
				),
			{ timeout: 10_000 },
		);
		const stamp = stamped({})._metadata;
		const walletId = uuidv7();
		const now = new Date().toISOString();

		await device.writeTransaction(async (tx) => {
			await tx.execute(
				"UPDATE households SET base_currency = 'PKR', _metadata = ? WHERE id = ?",
				[stamp, personal.id],
			);
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[walletId, personal.id, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'balance_adjustment', '12345678901234.5678', '2026-10-26', ?, ?, ?)`,
				[uuidv7(), personal.id, walletId, user.id, now, stamp],
			);
		});
		await waitForUploads(device);

		expect(await uploadErrors(device)).toEqual([]);
		const { data, error } = await adminClient()
			.from("entries")
			.select("amount::text")
			.eq("wallet_id", walletId);
		if (error) throw error;
		expect(data).toEqual([{ amount: "12345678901234.5678" }]);
		const household = await adminClient()
			.from("households")
			.select("base_currency")
			.eq("id", personal.id)
			.single();
		expect(household.data?.base_currency).toBe("PKR");
	});

	it("an itemized Expense uploads with its Items, keeps its amount to their sum, and follows their edits and its deletion", async () => {
		const user = await signInNewUser();
		const device = await connectClient(user);
		const personal = await vi.waitFor(
			() =>
				device.get<{ id: string }>(
					"SELECT id FROM households WHERE personal_user_id = ?",
					[user.id],
				),
			{ timeout: 10_000 },
		);
		const groceries = await vi.waitFor(
			() =>
				device.get<{ id: string }>(
					"SELECT id FROM categories WHERE household_id = ? AND name = 'Groceries'",
					[personal.id],
				),
			{ timeout: 10_000 },
		);
		const stamp = stamped({})._metadata;
		const [walletId, expenseId] = [uuidv7(), uuidv7()];
		const now = new Date().toISOString();
		const [milkId, restId] = [uuidv7(), uuidv7()];
		const item = (
			tx: { execute: typeof device.execute },
			id: string,
			position: number,
			description: string,
			amount: string,
			rest: boolean,
		) =>
			tx.execute(
				`INSERT INTO entry_items (id, household_id, entry_id, position, description, amount, category_id, rest, created_at, _metadata)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					id,
					personal.id,
					expenseId,
					position,
					description,
					amount,
					groceries.id,
					rest ? 1 : 0,
					now,
					stamp,
				],
			);

		await device.writeTransaction(async (tx) => {
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[walletId, personal.id, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'expense', '-500', ?, '2026-10-26', ?, ?, ?)`,
				[expenseId, personal.id, walletId, groceries.id, user.id, now, stamp],
			);
			await item(tx, milkId, 0, "Milk", "120", false);
			await item(tx, restId, 1, "Other Groceries", "380", true);
		});
		// Edited as the app does: the kept Item updated in place, the Rest dropped. The Entry row isn't touched, yet
		// the server takes the Expense's amount from its Items.
		await device.writeTransaction(async (tx) => {
			await tx.execute("DELETE FROM entry_items WHERE id = ?", [restId]);
			await tx.execute(
				"UPDATE entry_items SET amount = '500', _metadata = ? WHERE id = ?",
				[stamp, milkId],
			);
		});
		await waitForUploads(device);
		expect(await uploadErrors(device)).toEqual([]);
		const items = await adminClient()
			.from("entry_items")
			.select("id, description, amount::text, rest")
			.eq("entry_id", expenseId);
		if (items.error) throw items.error;
		expect(items.data).toEqual([
			{ id: milkId, description: "Milk", amount: "500", rest: false },
		]);
		const expense = await adminClient()
			.from("entries")
			.select("amount::text")
			.eq("id", expenseId)
			.single();
		expect(expense.data?.amount).toBe("-500");

		await device.writeTransaction(async (tx) => {
			await tx.execute("DELETE FROM entry_items WHERE entry_id = ?", [
				expenseId,
			]);
			await tx.execute("DELETE FROM entries WHERE id = ?", [expenseId]);
		});
		await waitForUploads(device);
		expect(await uploadErrors(device)).toEqual([]);
		const gone = await adminClient()
			.from("entry_items")
			.select("id")
			.eq("entry_id", expenseId);
		expect(gone.data).toEqual([]);
	});

	it("an Expense and an Income upload with their Category, time and notes, and an edit and a delete follow", async () => {
		const user = await signInNewUser();
		const device = await connectClient(user);
		const personal = await vi.waitFor(
			() =>
				device.get<{ id: string }>(
					"SELECT id FROM households WHERE personal_user_id = ?",
					[user.id],
				),
			{ timeout: 10_000 },
		);
		// The household's template Categories sync down with it.
		const category = (name: string) =>
			vi.waitFor(
				() =>
					device.get<{ id: string }>(
						"SELECT id FROM categories WHERE household_id = ? AND name = ?",
						[personal.id, name],
					),
				{ timeout: 10_000 },
			);
		const groceries = await category("Groceries");
		const salary = await category("Salary");
		const stamp = stamped({})._metadata;
		const walletId = uuidv7();
		const [expenseId, incomeId] = [uuidv7(), uuidv7()];
		const now = new Date().toISOString();

		await device.writeTransaction(async (tx) => {
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[walletId, personal.id, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, occurred_time, description, notes, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'expense', '-450.50', ?, '2026-10-26', '18:30', 'Weekly shop', 'Two bags', ?, ?, ?)`,
				[expenseId, personal.id, walletId, groceries.id, user.id, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'income', '90000', ?, '2026-10-25', ?, ?, ?)`,
				[incomeId, personal.id, walletId, salary.id, user.id, now, stamp],
			);
		});
		await device.execute(
			"UPDATE entries SET amount = '-500', notes = NULL, _metadata = ? WHERE id = ?",
			[stamp, expenseId],
		);
		await device.execute("DELETE FROM entries WHERE id = ?", [incomeId]);
		await waitForUploads(device);

		expect(await uploadErrors(device)).toEqual([]);
		const { data, error } = await adminClient()
			.from("entries")
			.select(
				"kind, amount::text, category_id, occurred_time, description, notes",
			)
			.eq("wallet_id", walletId);
		if (error) throw error;
		expect(data).toEqual([
			{
				kind: "expense",
				amount: "-500",
				category_id: groceries.id,
				occurred_time: "18:30",
				description: "Weekly shop",
				notes: null,
			},
		]);
	});
});
