import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { connectClient } from "./powersync";
import { seedHousehold } from "./seed";
import { adminClient, signInNewUser, userClient } from "./users";

// #44: devices ask for past dates' rates; fetch-exchange-rates (pg_cron, the service role) learns what's due, stores
// each date once, and the rates sync to the devices whose households use those currencies.

/** A date early in OXR's history that a test owns: whatever an earlier run left for it is cleared first. */
const freshDate = () => {
	const day = new Date(
		Date.UTC(1999, 0, 1) + Math.floor(Math.random() * 2500) * 86_400_000,
	);
	return day.toISOString().slice(0, 10);
};

type Facts = { requested: { date: string; lastAttemptAt: string | null }[] };

describe("exchange rates", () => {
	it("takes a User's ask for past dates, at most 31 a day, and forgets each date once it's stored", async () => {
		const admin = adminClient();
		const user = await signInNewUser();
		const api = userClient(user);
		const wanted = freshDate();
		await admin.from("exchange_rates").delete().eq("on_date", wanted);

		const asked = await api.rpc("request_exchange_rates", {
			dates: [wanted, wanted, "2999-01-01", "1998-12-31"],
		});
		expect(asked).toMatchObject({ error: null, data: 1 });

		const facts = await admin.rpc("exchange_rate_facts");
		if (facts.error) throw facts.error;
		expect((facts.data as Facts).requested).toContainEqual({
			date: wanted,
			lastAttemptAt: null,
		});

		// The rate as OXR wrote it, exponent and all, comes back as a plain decimal.
		const stored = await admin.rpc("store_exchange_rates", {
			on_date: wanted,
			rates: { PKR: "56.2", BTC: "1.34e-05" },
		});
		expect(stored).toMatchObject({ error: null, data: 2 });
		const { data: rows } = await admin
			.from("exchange_rates")
			.select("currency, per_usd::text")
			.eq("on_date", wanted)
			.order("currency");
		expect(rows).toEqual([
			{ currency: "BTC", per_usd: "0.0000134" },
			{ currency: "PKR", per_usd: "56.2" },
		]);
		const after = await admin.rpc("exchange_rate_facts");
		expect((after.data as Facts).requested.map((r) => r.date)).not.toContain(
			wanted,
		);

		// A held date is never asked for again; and a User's asks run out for the day.
		expect(
			(await api.rpc("request_exchange_rates", { dates: [wanted] })).data,
		).toBe(0);
		const many = Array.from({ length: 40 }, freshDate);
		const capped = await api.rpc("request_exchange_rates", { dates: many });
		expect(capped.data).toBeLessThanOrEqual(30);
		// Storing nothing for a date forgets the ask, so no run leaves asks behind.
		for (const date of many)
			await admin.rpc("store_exchange_rates", { on_date: date, rates: {} });
	});

	it("is the service role's to fetch and store; a User may only ask", async () => {
		const api = userClient(await signInNewUser());
		for (const [name, args] of [
			["exchange_rate_facts", {}],
			["record_exchange_rate_fetch", { on_date: freshDate() }],
			["store_exchange_rates", { on_date: freshDate(), rates: { PKR: "1" } }],
		] as const) {
			const { error } = await api.rpc(name, args);
			expect(error?.code, name).toBe("42501");
		}
		const insert = await api
			.from("exchange_rates")
			.insert({ on_date: freshDate(), currency: "PKR", per_usd: "1" });
		expect(insert.error).not.toBeNull();
	});

	it("syncs a date's rates for the currencies the User's households use, and no others", async () => {
		const admin = adminClient();
		const day = freshDate();
		await admin.from("exchange_rates").delete().eq("on_date", day);
		const stored = await admin.rpc("store_exchange_rates", {
			on_date: day,
			rates: { PKR: "280.5", USD: "1", JPY: "152.1" },
		});
		if (stored.error) throw stored.error;
		// A household in PKR with a USD Wallet: its device gets PKR and USD, never JPY.
		const { users, household } = await seedHousehold({ owner: "admin" });
		for (const { error } of [
			await admin
				.from("households")
				.update({ base_currency: "PKR" })
				.eq("id", household),
			await admin.from("wallets").insert({
				id: uuidv7(),
				household_id: household,
				name: "Dollars",
				type: "bank",
				currency: "USD",
			}),
		])
			if (error) throw error;
		const device = await connectClient(users.owner);
		await vi.waitFor(async () =>
			expect(
				await device.getAll(
					"SELECT currency, per_usd FROM exchange_rates WHERE on_date = ? ORDER BY currency",
					[day],
				),
			).toEqual([
				{ currency: "PKR", per_usd: "280.5" },
				{ currency: "USD", per_usd: "1" },
			]),
		);
	});
});
