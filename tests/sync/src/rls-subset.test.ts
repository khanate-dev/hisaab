import { describe, expect, it, vi } from "vitest";

import { connectClient } from "./powersync";
import { seedHouseholds } from "./seed";
import { userClient } from "./users";

// ADR-0001 amendment: every row a Sync Stream sends a User must also be readable by them under RLS.
const SYNCED_TABLES = ["households", "memberships"] as const;

describe("RLS ⊇ Sync Streams", async () => {
	const seed = await seedHouseholds();

	it.each(Object.entries(seed.users))(
		"%s syncs only rows RLS lets them read",
		async (_name, user) => {
			const device = await connectClient(user);
			const api = userClient(user);

			for (const table of SYNCED_TABLES) {
				const synced = (
					await device.getAll<{ id: string }>(`SELECT id FROM ${table}`)
				).map((row) => row.id);
				const readable = await api.from(table).select("id");
				if (readable.error) throw readable.error;

				expect(synced.length, `${table} synced something`).toBeGreaterThan(0);
				expect(readable.data.map((row) => row.id)).toEqual(
					expect.arrayContaining(synced),
				);
			}
		},
	);

	it("streams shared households to their Members and not to outsiders", async () => {
		const syncedHouseholds = async (
			user: (typeof seed.users)[keyof typeof seed.users],
		) => {
			const device = await connectClient(user);
			return () =>
				device
					.getAll<{ id: string }>("SELECT id FROM households")
					.then((rows) => rows.map((r) => r.id));
		};
		const { family, side } = seed.households;

		const carol = await syncedHouseholds(seed.users.carol);
		await vi.waitFor(async () => expect(await carol()).toContain(family));
		expect(await carol()).not.toContain(side);

		const dave = await syncedHouseholds(seed.users.dave);
		expect(await dave()).toHaveLength(1);
	});
});
