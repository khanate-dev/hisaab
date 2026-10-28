import { CONTRACT_VERSION, stamped } from "@hisaab/client-schema";
import {
	budgetFor,
	occurrenceEntryId,
	occurrenceId,
	preferenceId,
} from "@hisaab/domain";
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
import { adminClient, signInNewUser, userClient } from "./users";

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

	it("a Loan uploads with its Contact and principal, then a Repayment, a write-off and its deletion", async () => {
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
		const stamp = stamped({})._metadata;
		const [walletId, contactId, loanId] = [uuidv7(), uuidv7(), uuidv7()];
		const now = new Date().toISOString();
		await device.writeTransaction(async (tx) => {
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[walletId, personal.id, now, stamp],
			);
			await tx.execute(
				"INSERT INTO contacts (id, household_id, name, created_at, _metadata) VALUES (?, ?, 'Ali', ?, ?)",
				[contactId, personal.id, now, stamp],
			);
			await tx.execute(
				"INSERT INTO loans (id, household_id, contact_id, direction, due_on, created_at, _metadata) VALUES (?, ?, ?, 'lent', '2026-12-31', ?, ?)",
				[loanId, personal.id, contactId, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'loan_principal', '-1000', ?, '2026-10-26', ?, ?, ?)`,
				[uuidv7(), personal.id, walletId, loanId, user.id, now, stamp],
			);
		});
		await device.execute(
			`INSERT INTO entries (id, household_id, wallet_id, kind, amount, loan_id, occurred_on, created_by, created_at, _metadata)
			VALUES (?, ?, ?, 'repayment', '300', ?, '2026-10-27', ?, ?, ?)`,
			[uuidv7(), personal.id, walletId, loanId, user.id, now, stamp],
		);
		await device.execute(
			"UPDATE loans SET written_off_at = ?, _metadata = ? WHERE id = ?",
			[now, stamp, loanId],
		);
		await waitForUploads(device);
		expect(await uploadErrors(device)).toEqual([]);
		const loan = await adminClient()
			.from("loans")
			.select("written_off_at")
			.eq("id", loanId)
			.single();
		expect(loan.data?.written_off_at).not.toBeNull();
		const loanEntries = await adminClient()
			.from("entries")
			.select("kind, amount::text")
			.eq("loan_id", loanId);
		expect(
			loanEntries.data?.map((e) => `${e.kind} ${e.amount}`).sort(),
		).toEqual(["loan_principal -1000", "repayment 300"]);

		// Deleted as the app deletes a Loan: its Entries first, then the Loan, all stamped.
		await device.writeTransaction(async (tx) => {
			await tx.execute(
				"UPDATE entries SET _deleted = 1, _metadata = ? WHERE loan_id = ?",
				[stamp, loanId],
			);
			await tx.execute(
				"UPDATE loans SET _deleted = 1, _metadata = ? WHERE id = ?",
				[stamp, loanId],
			);
		});
		await waitForUploads(device);
		expect(await uploadErrors(device)).toEqual([]);
		const gone = await adminClient()
			.from("loans")
			.select("id")
			.eq("id", loanId);
		expect(gone.data).toEqual([]);
	});

	it("the Activity log keeps an uploaded change's device time, and a deleted Entry comes back from it", async () => {
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
		const madeAt = new Date("2026-10-26T13:30:00.000Z");
		const stamp = stamped({}, CONTRACT_VERSION, madeAt)._metadata;
		const [walletId, entryId] = [uuidv7(), uuidv7()];
		const now = new Date().toISOString();
		await device.writeTransaction(async (tx) => {
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[walletId, personal.id, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'balance_adjustment', '12345678901234.5678', '2026-10-26', ?, ?, ?)`,
				[entryId, personal.id, walletId, user.id, now, stamp],
			);
		});
		await waitForUploads(device);
		const logged = await adminClient()
			.from("activity_log")
			.select("actor_id, device_time, after")
			.eq("row_id", entryId)
			.eq("action", "insert")
			.single();
		if (logged.error) throw logged.error;
		expect(logged.data.actor_id).toBe(user.id);
		expect(new Date(logged.data.device_time ?? "").toISOString()).toBe(
			madeAt.toISOString(),
		);
		// Money stays exact in the log: text, never a rounded JSON number.
		expect((logged.data.after as { amount: unknown }).amount).toBe(
			"12345678901234.5678",
		);

		// Deleted as the app deletes: stamped, so the deletion too says when it happened on the device.
		const deletedAt = new Date("2026-10-26T14:00:00.000Z");
		await device.execute(
			"UPDATE entries SET _deleted = 1, _metadata = ? WHERE id = ?",
			[stamped({}, CONTRACT_VERSION, deletedAt)._metadata, entryId],
		);
		await waitForUploads(device);
		const deletion = await adminClient()
			.from("activity_log")
			.select("device_time")
			.eq("row_id", entryId)
			.eq("action", "delete")
			.single();
		expect(new Date(deletion.data?.device_time ?? "").toISOString()).toBe(
			deletedAt.toISOString(),
		);
		const restored = await userClient(user).rpc("restore_entry", {
			entry_id: entryId,
		});
		if (restored.error) throw restored.error;
		await vi.waitFor(
			async () =>
				expect(
					await device.getOptional<{ amount: string }>(
						"SELECT amount FROM entries WHERE id = ?",
						[entryId],
					),
				).toEqual({ amount: "12345678901234.5678" }),
			{ timeout: 10_000 },
		);
	});

	it("a Transfer and a Balance adjustment upload, and both can be edited or deleted", async () => {
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
		const stamp = stamped({})._metadata;
		const [cash, bank, transferId, adjustmentId] = [
			uuidv7(),
			uuidv7(),
			uuidv7(),
			uuidv7(),
		];
		const now = new Date().toISOString();

		await device.writeTransaction(async (tx) => {
			for (const [id, name] of [
				[cash, "Cash"],
				[bank, "HBL"],
			] as const)
				await tx.execute(
					"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, ?, 'cash', 'PKR', ?, ?)",
					[id, personal.id, name, now, stamp],
				);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, to_wallet_id, kind, amount, to_amount, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, ?, 'transfer', '-5000', '5000', '2026-10-26', ?, ?, ?)`,
				[transferId, personal.id, cash, bank, user.id, now, stamp],
			);
			await tx.execute(
				`INSERT INTO entries (id, household_id, wallet_id, kind, amount, occurred_on, created_by, created_at, _metadata)
				VALUES (?, ?, ?, 'balance_adjustment', '-250', '2026-10-26', ?, ?, ?)`,
				[adjustmentId, personal.id, bank, user.id, now, stamp],
			);
		});
		await device.execute(
			"UPDATE entries SET amount = '-6000', to_amount = '6000', _metadata = ? WHERE id = ?",
			[stamp, transferId],
		);
		await waitForUploads(device);
		expect(await uploadErrors(device)).toEqual([]);
		const transfer = await adminClient()
			.from("entries")
			.select("wallet_id, to_wallet_id, amount::text, to_amount::text")
			.eq("id", transferId)
			.single();
		expect(transfer.data).toEqual({
			wallet_id: cash,
			to_wallet_id: bank,
			amount: "-6000",
			to_amount: "6000",
		});

		await device.execute("DELETE FROM entries WHERE id IN (?, ?)", [
			transferId,
			adjustmentId,
		]);
		await waitForUploads(device);
		expect(await uploadErrors(device)).toEqual([]);
		const left = await adminClient()
			.from("entries")
			.select("id")
			.in("id", [transferId, adjustmentId]);
		expect(left.data).toEqual([]);
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

	it("a shared household created offline uploads with its founder as Admin, gets its Categories, and keeps their default Wallet", async () => {
		const user = await signInNewUser();
		const device = await connectClient(user);
		const stamp = stamped({})._metadata;
		const household = uuidv7();
		const membership = uuidv7();
		const wallet = uuidv7();
		const now = new Date().toISOString();

		await goOffline(device);
		// As the app's createHousehold does: the household first, then its founder's Admin Membership.
		await device.writeTransaction(async (tx) => {
			await tx.execute(
				`INSERT INTO households (id, name, personal_user_id, base_currency, timezone, budget_month_start_day, created_by, created_at, _metadata)
				VALUES (?, 'Family', NULL, 'PKR', 'Asia/Karachi', 1, ?, ?, ?)`,
				[household, user.id, now, stamp],
			);
			await tx.execute(
				"INSERT INTO memberships (id, household_id, user_id, role, default_wallet_id, created_at, _metadata) VALUES (?, ?, ?, 'admin', NULL, ?, ?)",
				[membership, household, user.id, now, stamp],
			);
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[wallet, household, now, stamp],
			);
			await tx.execute(
				"UPDATE memberships SET default_wallet_id = ?, _metadata = ? WHERE id = ?",
				[wallet, stamp, membership],
			);
			await tx.execute(
				"UPDATE households SET budget_month_start_day = 25, _metadata = ? WHERE id = ?",
				[stamp, household],
			);
		});
		await goOnline(device);
		await waitForUploads(device);

		expect(await uploadErrors(device)).toEqual([]);
		const { data, error } = await adminClient()
			.from("memberships")
			.select("user_id, role, default_wallet_id")
			.eq("household_id", household);
		if (error) throw error;
		expect(data).toEqual([
			{ user_id: user.id, role: "admin", default_wallet_id: wallet },
		]);
		await vi.waitFor(
			async () =>
				expect(
					(
						await device.getAll(
							"SELECT id FROM categories WHERE household_id = ?",
							[household],
						)
					).length,
				).toBeGreaterThan(0),
			{ timeout: 10_000 },
		);
		expect(
			await device.get<{ day: number }>(
				"SELECT budget_month_start_day AS day FROM households WHERE id = ?",
				[household],
			),
		).toEqual({ day: 25 });
	});

	it("an Admin's Invite uploads, reaches only Admins, and a revoke follows", async () => {
		const { users, household } = await seedHousehold({
			admin: "admin",
			member: "member",
		});
		const admin = await connectClient(users.admin);
		const member = await connectClient(users.member);
		const stamp = stamped({})._metadata;
		const invite = uuidv7();
		const now = new Date();

		await admin.execute(
			`INSERT INTO invites (id, household_id, token, role, email, expires_at, created_by, created_at, _metadata)
			VALUES (?, ?, ?, 'viewer', 'sara@example.com', ?, ?, ?, ?)`,
			[
				invite,
				household,
				"b".repeat(32),
				new Date(now.getTime() + 86_400_000).toISOString(),
				users.admin.id,
				now.toISOString(),
				stamp,
			],
		);
		await admin.execute(
			"UPDATE invites SET revoked_at = ?, _metadata = ? WHERE id = ?",
			[new Date().toISOString(), stamp, invite],
		);
		await waitForUploads(admin);

		expect(await uploadErrors(admin)).toEqual([]);
		const { data, error } = await adminClient()
			.from("invites")
			.select("role, email, revoked_at")
			.eq("id", invite)
			.single();
		if (error) throw error;
		expect(data).toMatchObject({ role: "viewer", email: "sara@example.com" });
		expect(data.revoked_at).not.toBeNull();
		await vi.waitFor(async () =>
			expect(
				await member.getAll("SELECT id FROM households WHERE id = ?", [
					household,
				]),
			).toHaveLength(1),
		);
		expect(await member.getAll("SELECT id FROM invites")).toEqual([]);
	});

	it("a removed Member loses the household from their device, and a deleted household goes from everyone's", async () => {
		const { users, household } = await seedHousehold({
			admin: "admin",
			member: "member",
		});
		const admin = await connectClient(users.admin);
		const member = await connectClient(users.member);
		const has = (device: AbstractPowerSyncDatabase) =>
			device.getAll("SELECT id FROM households WHERE id = ?", [household]);
		await vi.waitFor(async () => expect(await has(member)).toHaveLength(1));

		const { id: membership } = await admin.get<{ id: string }>(
			"SELECT id FROM memberships WHERE household_id = ? AND user_id = ?",
			[household, users.member.id],
		);
		await admin.execute(
			"UPDATE memberships SET _deleted = 1, _metadata = ? WHERE id = ?",
			[stamped({})._metadata, membership],
		);
		await waitForUploads(admin);
		expect(await uploadErrors(admin)).toEqual([]);
		await vi.waitFor(async () => expect(await has(member)).toEqual([]), {
			timeout: 10_000,
		});

		await admin.execute(
			"UPDATE households SET _deleted = 1, _metadata = ? WHERE id = ?",
			[stamped({})._metadata, household],
		);
		await waitForUploads(admin);
		expect(await uploadErrors(admin)).toEqual([]);
		expect(await serverName(household)).toBeUndefined();
		await vi.waitFor(
			async () =>
				expect(
					await admin.getAll(
						"SELECT id FROM categories WHERE household_id = ?",
						[household],
					),
				).toEqual([]),
			{ timeout: 10_000 },
		);
	});

	it("a cross-household transfer uploads as mirrored halves, each household seeing only its own", async () => {
		const { users, household } = await seedHousehold({
			mover: "member",
			partner: "admin",
		});
		const admin = adminClient();
		const personal = await admin
			.from("households")
			.select("id")
			.eq("personal_user_id", users.mover.id)
			.single();
		if (personal.error) throw personal.error;
		const salary = uuidv7();
		const joint = uuidv7();
		const wallets = await admin.from("wallets").insert([
			{
				id: salary,
				household_id: personal.data.id,
				name: "Salary",
				type: "bank",
				currency: "PKR",
			},
			{
				id: joint,
				household_id: household,
				name: "Joint",
				type: "bank",
				currency: "PKR",
			},
		]);
		if (wallets.error) throw wallets.error;
		const mover = await connectClient(users.mover);
		const partner = await connectClient(users.partner);
		const stamp = stamped({})._metadata;
		const link = uuidv7();
		const now = new Date().toISOString();

		await mover.writeTransaction(async (tx) => {
			for (const [id, householdId, walletId, amount] of [
				[uuidv7(), personal.data.id, salary, "-5000"],
				[uuidv7(), household, joint, "5000"],
			])
				await tx.execute(
					`INSERT INTO entries (id, household_id, wallet_id, kind, amount, link_id, occurred_on, created_by, created_at, _metadata)
					VALUES (?, ?, ?, 'household_transfer', ?, ?, '2026-10-27', ?, ?, ?)`,
					[id, householdId, walletId, amount, link, users.mover.id, now, stamp],
				);
		});
		await waitForUploads(mover);

		expect(await uploadErrors(mover)).toEqual([]);
		const halves = await admin
			.from("entries")
			.select("household_id, amount::text")
			.eq("link_id", link)
			.order("amount");
		if (halves.error) throw halves.error;
		expect(halves.data).toEqual([
			{ household_id: personal.data.id, amount: "-5000" },
			{ household_id: household, amount: "5000" },
		]);
		await vi.waitFor(
			async () =>
				expect(
					await partner.getAll<{ household_id: string }>(
						"SELECT household_id FROM entries WHERE link_id = ?",
						[link],
					),
				).toEqual([{ household_id: household }]),
			{ timeout: 10_000 },
		);
	});
	it("two devices setting the same month's Budget offline both upload, and the one written last wins", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			bob: "member",
		});
		const alice = await connectClient(users.alice);
		const bob = await connectClient(users.bob);
		const groceries = await vi.waitFor(
			() =>
				alice.get<{ id: string }>(
					"SELECT id FROM categories WHERE household_id = ? AND name = 'Groceries'",
					[household],
				),
			{ timeout: 10_000 },
		);
		const setBudget = (
			device: AbstractPowerSyncDatabase,
			amount: string,
			createdAt: string,
		) =>
			device.execute(
				"INSERT INTO budgets (id, household_id, category_id, valid_from, amount, created_at, _metadata) VALUES (?, ?, ?, '2026-10', ?, ?, ?)",
				[
					uuidv7(),
					household,
					groceries.id,
					amount,
					createdAt,
					stamped({})._metadata,
				],
			);

		await goOffline(alice);
		await goOffline(bob);
		await setBudget(alice, "30000", "2026-10-02T09:00:00.000Z");
		await setBudget(bob, "35000", "2026-10-02T10:00:00.000Z");
		await goOnline(bob);
		await waitForUploads(bob);
		await goOnline(alice);
		await waitForUploads(alice);

		expect(await uploadErrors(alice)).toEqual([]);
		expect(await uploadErrors(bob)).toEqual([]);
		for (const device of [alice, bob])
			await vi.waitFor(
				async () => {
					const rows = await device.getAll<{
						category_id: string;
						valid_from: string;
						amount: string | null;
						created_at: string;
					}>(
						"SELECT category_id, valid_from, amount, created_at FROM budgets WHERE household_id = ?",
						[household],
					);
					expect(rows).toHaveLength(2);
					expect(
						budgetFor(groceries.id, "2026-11", rows, [], "PKR")?.toString(),
					).toBe("35000");
				},
				{ timeout: 10_000 },
			);
	});
	it("two devices confirming the same Occurrence offline upload as one Entry, recorded by the first", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			bob: "member",
		});
		const alice = await connectClient(users.alice);
		const bob = await connectClient(users.bob);
		const rent = await vi.waitFor(
			() =>
				alice.get<{ id: string }>(
					"SELECT id FROM categories WHERE household_id = ? AND name = 'Rent'",
					[household],
				),
			{ timeout: 10_000 },
		);
		const walletId = uuidv7();
		const ruleId = uuidv7();
		const now = new Date().toISOString();
		await alice.writeTransaction(async (tx) => {
			await tx.execute(
				"INSERT INTO wallets (id, household_id, name, type, currency, created_at, _metadata) VALUES (?, ?, 'Cash', 'cash', 'PKR', ?, ?)",
				[walletId, household, now, stamped({})._metadata],
			);
			await tx.execute(
				`INSERT INTO recurring_rules (id, household_id, mode, kind, wallet_id, category_id, amount, frequency, interval, day_of_month, starts_on, created_by, created_at, _metadata)
				VALUES (?, ?, 'confirm', 'expense', ?, ?, '50000', 'monthly', 1, 1, '2026-10-01', ?, ?, ?)`,
				[
					ruleId,
					household,
					walletId,
					rent.id,
					users.alice.id,
					now,
					stamped({})._metadata,
				],
			);
		});
		await waitForUploads(alice);
		await vi.waitFor(
			async () =>
				expect(
					await bob.getOptional("SELECT id FROM recurring_rules WHERE id = ?", [
						ruleId,
					]),
				).not.toBeNull(),
			{ timeout: 10_000 },
		);

		// What confirmOccurrences writes: the Occurrence, then its Entry, both with ids from the rule and due date.
		const confirm = (device: AbstractPowerSyncDatabase, userId: string) =>
			device.writeTransaction(async (tx) => {
				const entryId = occurrenceEntryId(ruleId, "2026-10-01");
				await tx.execute(
					"INSERT INTO occurrences (id, household_id, rule_id, due_on, state, entry_id, created_at, _metadata) VALUES (?, ?, ?, '2026-10-01', 'confirmed', ?, ?, ?)",
					[
						occurrenceId(ruleId, "2026-10-01"),
						household,
						ruleId,
						entryId,
						new Date().toISOString(),
						stamped({})._metadata,
					],
				);
				await tx.execute(
					`INSERT INTO entries (id, household_id, wallet_id, kind, amount, category_id, occurred_on, created_by, created_at, _metadata)
					VALUES (?, ?, ?, 'expense', '-50000', ?, '2026-10-01', ?, ?, ?)`,
					[
						entryId,
						household,
						walletId,
						rent.id,
						userId,
						new Date().toISOString(),
						stamped({})._metadata,
					],
				);
			});
		await goOffline(alice);
		await goOffline(bob);
		await confirm(alice, users.alice.id);
		await confirm(bob, users.bob.id);
		await goOnline(alice);
		await waitForUploads(alice);
		await goOnline(bob);
		await waitForUploads(bob);

		expect(await uploadErrors(alice)).toEqual([]);
		expect(await uploadErrors(bob)).toEqual([]);
		const { data, error } = await adminClient()
			.from("entries")
			.select("id, created_by")
			.eq("household_id", household)
			.eq("kind", "expense");
		if (error) throw error;
		expect(data).toEqual([
			{
				id: occurrenceEntryId(ruleId, "2026-10-01"),
				created_by: users.alice.id,
			},
		]);
	});
	it("a Notification marked read and a preference set offline upload, and only the read mark changes", async () => {
		const { users, household } = await seedHousehold({
			alice: "admin",
			bob: "member",
		});
		const admin = adminClient();
		const alice = await connectClient(users.alice);
		// The seed's joins raised Membership Notifications into Alice's inbox.
		const notification = await vi.waitFor(
			() =>
				alice.get<{ id: string; payload: string }>(
					"SELECT id, payload FROM notifications LIMIT 1",
				),
			{ timeout: 10_000 },
		);
		await goOffline(alice);
		await alice.execute(
			"UPDATE notifications SET read_at = ?, _metadata = ? WHERE id = ?",
			[new Date().toISOString(), stamped({})._metadata, notification.id],
		);
		await alice.execute(
			"INSERT INTO notification_preferences (id, household_id, user_id, trigger, enabled, created_at, _metadata) VALUES (?, ?, ?, 'membership', 0, ?, ?)",
			[
				preferenceId(users.alice.id, household, "membership"),
				household,
				users.alice.id,
				new Date().toISOString(),
				stamped({})._metadata,
			],
		);
		await goOnline(alice);
		await waitForUploads(alice);

		expect(await uploadErrors(alice)).toEqual([]);
		const row = await admin
			.from("notifications")
			.select("read_at, payload")
			.eq("id", notification.id)
			.single();
		if (row.error) throw row.error;
		expect(row.data.read_at).not.toBeNull();
		expect(row.data.payload).toBe(notification.payload);
		const prefs = await admin
			.from("notification_preferences")
			.select("enabled")
			.eq("user_id", users.alice.id);
		if (prefs.error) throw prefs.error;
		expect(prefs.data).toEqual([{ enabled: false }]);
	});
});
