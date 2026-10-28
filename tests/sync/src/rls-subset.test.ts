import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { connectClient } from "./powersync";
import { seedHouseholds } from "./seed";
import { type SignedInUser, userClient } from "./users";

// ADR-0001 amendment: every row a Sync Stream sends a User must also be readable by them under RLS.
const SYNCED_TABLES = [
	"app_config",
	"households",
	"memberships",
	"profiles",
	"wallets",
	"categories",
	"entries",
	"entry_items",
	"contacts",
	"loans",
	"budgets",
	"budget_overrides",
	"recurring_rules",
	"occurrences",
	"saved_filters",
	"attachments",
	"import_mappings",
	"notifications",
	"notification_preferences",
	"invites",
] as const;

const syncedIds = async (
	device: AbstractPowerSyncDatabase,
	table: (typeof SYNCED_TABLES)[number],
) =>
	(await device.getAll<{ id: string }>(`SELECT id FROM ${table}`)).map(
		(row) => row.id,
	);

describe("RLS ⊇ Sync Streams", () => {
	let seed: Awaited<ReturnType<typeof seedHouseholds>>;
	beforeAll(async () => {
		seed = await seedHouseholds();
	});

	it.each(["alice", "bob", "carol", "dave"] as const)(
		"%s syncs only rows RLS lets them read",
		async (name) => {
			const user: SignedInUser = seed.users[name];
			const device = await connectClient(user);
			const api = userClient(user);

			for (const table of SYNCED_TABLES) {
				const synced = await syncedIds(device, table);
				const readable = await api.from(table).select("id");
				if (readable.error) throw readable.error;

				// dave is in no shared household, so nothing has notified him.
				if (!(table === "notifications" && name === "dave"))
					expect(synced.length, `${table} synced something`).toBeGreaterThan(0);
				expect(readable.data.map((row) => row.id)).toEqual(
					expect.arrayContaining(synced),
				);
			}
		},
	);

	it("streams a shared household to every Role in it and to no one else", async () => {
		const { family, side } = seed.households;

		for (const name of ["alice", "bob", "carol"] as const) {
			const device = await connectClient(seed.users[name]);
			await vi.waitFor(async () =>
				expect(await syncedIds(device, "households")).toContain(family),
			);
		}

		const carol = await connectClient(seed.users.carol);
		expect(await syncedIds(carol, "households")).not.toContain(side);
		const dave = await connectClient(seed.users.dave);
		expect(await syncedIds(dave, "households")).toHaveLength(1);
	});

	it("streams names, Wallets and Categories only within shared households", async () => {
		const dave = await connectClient(seed.users.dave);
		expect(await syncedIds(dave, "profiles")).toEqual([seed.users.dave.id]);

		const carol = await connectClient(seed.users.carol);
		await vi.waitFor(async () =>
			expect(await syncedIds(carol, "profiles")).toContain(seed.users.alice.id),
		);
		const walletHouseholds = await carol.getAll<{ household_id: string }>(
			"SELECT household_id FROM wallets",
		);
		expect(walletHouseholds.map((w) => w.household_id)).not.toContain(
			seed.households.side,
		);
		const categoryHouseholds = await carol.getAll<{ household_id: string }>(
			"SELECT DISTINCT household_id FROM categories",
		);
		expect(categoryHouseholds.length).toBeGreaterThan(0);
		expect(categoryHouseholds.map((c) => c.household_id)).not.toContain(
			seed.households.side,
		);
	});

	it("streams each household only its own half of a cross-household transfer", async () => {
		const { family } = seed.households;
		const carol = await connectClient(seed.users.carol);
		await vi.waitFor(async () =>
			expect(
				await carol.getAll<{ household_id: string }>(
					"SELECT household_id FROM entries WHERE kind = 'household_transfer'",
				),
			).toEqual([{ household_id: family }]),
		);
	});

	it("streams each User only their own Saved filters", async () => {
		for (const name of ["alice", "bob", "carol", "dave"] as const) {
			const user = seed.users[name];
			const device = await connectClient(user);
			await vi.waitFor(async () =>
				expect(
					(
						await device.getAll<{ user_id: string }>(
							"SELECT user_id FROM saved_filters",
						)
					).length,
				).toBeGreaterThan(0),
			);
			const owners = await device.getAll<{ user_id: string }>(
				"SELECT DISTINCT user_id FROM saved_filters",
			);
			expect(owners).toEqual([{ user_id: user.id }]);
		}
	});

	it("streams each User only their own Notifications", async () => {
		for (const name of ["alice", "bob", "carol"] as const) {
			const user = seed.users[name];
			const device = await connectClient(user);
			await vi.waitFor(async () =>
				expect(
					(await device.getAll("SELECT id FROM notifications")).length,
				).toBeGreaterThan(0),
			);
			expect(
				await device.getAll("SELECT DISTINCT user_id FROM notifications"),
			).toEqual([{ user_id: user.id }]);
		}
	});
});
