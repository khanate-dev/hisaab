import { v7 as uuidv7 } from "uuid";
import { afterAll, describe, expect, it, vi } from "vitest";

import { connectClient } from "./powersync";
import { seedHousehold } from "./seed";
import { adminClient, signInNewUser, userClient } from "./users";

// #44: devices ask for past dates' rates; fetch-exchange-rates (pg_cron, the service role) learns what's due, stores
// each date once, and the rates sync to the devices whose households use those currencies.

const admin = adminClient();

/** Consecutive dates early in OXR's history, from a random start, so runs rarely share any. */
const freshDates = (count: number) => {
	const start =
		Date.UTC(1999, 0, 1) + Math.floor(Math.random() * 5000) * 86_400_000;
	return Array.from({ length: count }, (_, i) =>
		new Date(start + i * 86_400_000).toISOString().slice(0, 10),
	);
};

/** Clears dates: their rates deleted, and any ask left over (from this run or a crashed one) fulfilled. */
const clear = async (dates: string[]) => {
	for (const date of dates)
		await admin.rpc("store_exchange_rates", { on_date: date, rates: {} });
	if (dates.length === 0) return;
	const { error } = await admin
		.from("exchange_rates")
		.delete()
		.in("on_date", dates);
	if (error) throw error;
};
/** Dates a test uses, cleared before it and after the file, so no run leaves rows behind. */
const used: string[] = [];
const own = async (dates: string[]) => {
	used.push(...dates);
	await clear(dates);
	return dates;
};
afterAll(() => clear(used));

type Facts = { requested: { date: string; attempts: number }[] };
const requested = async () => {
	const facts = await admin.rpc("exchange_rate_facts");
	if (facts.error) throw facts.error;
	return (facts.data as Facts).requested.map((r) => r.date);
};

describe("exchange rates", () => {
	it("takes a User's ask for past dates, and forgets each date once it's stored", async () => {
		const api = userClient(await signInNewUser());
		const [wanted] = await own(freshDates(1));

		const asked = await api.rpc("ask_for_exchange_rates", {
			dates: [wanted, wanted, "2999-01-01", "1998-12-31"],
		});
		expect(asked).toMatchObject({ error: null, data: 1 });
		expect(await requested()).toContain(wanted);
		// Asking again while it's pending adds nothing.
		expect(
			(await api.rpc("ask_for_exchange_rates", { dates: [wanted] })).data,
		).toBe(0);

		// The rate as OXR wrote it, exponent and all, comes back as a plain decimal.
		const stored = await admin.rpc("store_exchange_rates", {
			on_date: wanted,
			rates: { PKR: "56.2", BTC: "1.34e-05" },
		});
		expect(stored.error).toBeNull();
		const { data: rows } = await admin
			.from("exchange_rates")
			.select("currency, per_usd::text")
			.eq("on_date", wanted)
			.order("currency");
		expect(rows).toEqual([
			{ currency: "BTC", per_usd: "0.0000134" },
			{ currency: "PKR", per_usd: "56.2" },
		]);
		expect(await requested()).not.toContain(wanted);
		// A held date is never asked for again.
		expect(
			(await api.rpc("ask_for_exchange_rates", { dates: [wanted] })).data,
		).toBe(0);
	});

	it("lets a User ask for at most 31 dates a day", async () => {
		const api = userClient(await signInNewUser());
		const dates = await own(freshDates(41));
		const first = await api.rpc("ask_for_exchange_rates", {
			dates: dates.slice(0, 1),
		});
		expect(first.data).toBe(1);
		const rest = await api.rpc("ask_for_exchange_rates", {
			dates: dates.slice(1, 40),
		});
		expect(rest.data).toBe(30);
		const more = await api.rpc("ask_for_exchange_rates", {
			dates: dates.slice(40),
		});
		expect(more.data).toBe(0);
	});

	it("is the service role's to fetch and store; a User may only ask", async () => {
		const api = userClient(await signInNewUser());
		const [date] = await own(freshDates(1));
		for (const [name, args] of [
			["exchange_rate_facts", {}],
			["record_exchange_rate_fetch", { on_date: date }],
			["store_exchange_rates", { on_date: date, rates: { PKR: "1" } }],
		] as const) {
			const { error } = await api.rpc(name, args);
			expect(error?.code, name).toBe("42501");
		}
		const insert = await api
			.from("exchange_rates")
			.insert({ on_date: date, currency: "PKR", per_usd: "1" });
		expect(insert.error).not.toBeNull();
	});

	it("syncs a date's rates for the currencies the User's households use, and no others", async () => {
		const [day] = await own(freshDates(1));
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
