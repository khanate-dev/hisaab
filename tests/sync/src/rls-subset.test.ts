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
});
