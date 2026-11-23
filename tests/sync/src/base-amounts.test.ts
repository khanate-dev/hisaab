import {
	addMoney,
	baseAmountOf,
	budgetMonthOf,
	budgetMonthView,
	type CategoryLike,
	isNegative,
	isZero,
	negateMoney,
	parseMoney,
	type RateRow,
	shiftCalendarDate,
	timesMoney,
} from "@hisaab/domain";
import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedHousehold } from "./seed";
import { adminClient, userClient } from "./users";

// #45: the server fills every Entry's Base amount (`fill_base_amount`) the way a device prices it (`baseAmountOf`), and
// counts Base amounts in Budget notifications as the Budgets tab does. Its own currencies, BHD (3 decimals) as the Base
// and XTS (ISO's testing code) as the Wallet's, so no other test's rates are in play.
const BASE = "BHD";
const FOREIGN = "XTS";
const admin = adminClient();

const must = async <T>(
	run: PromiseLike<{ data: T; error: { message: string } | null }>,
) => {
	const { data, error } = await run;
	if (error) throw new Error(error.message);
	return data;
};

/** Only this file's rates, as a device would hold them. */
const heldRates = async () =>
	(await must(
		admin
			.from("exchange_rates")
			.select("on_date, currency, per_usd::text")
			.in("currency", [BASE, FOREIGN]),
	)) as RateRow[];
const clearRates = () =>
	must(admin.from("exchange_rates").delete().in("currency", [BASE, FOREIGN]));
const store = (date: string, base: string, foreign: string) =>
	must(
		admin.rpc("store_exchange_rates", {
			on_date: date,
			rates: { [BASE]: base, [FOREIGN]: foreign },
		}),
	);

/** A household in BHD with a BHD and an XTS Wallet, and an Admin to write as. */
const household = async () => {
	const { users, household: id } = await seedHousehold({ owner: "admin" });
	const base = uuidv7();
	const foreign = uuidv7();
	await must(
		admin.from("households").update({ base_currency: BASE }).eq("id", id),
	);
	await must(
		admin.from("wallets").insert([
			{
				id: base,
				household_id: id,
				name: "Home",
				type: "cash",
				currency: BASE,
			},
			{
				id: foreign,
				household_id: id,
				name: "Away",
				type: "bank",
				currency: FOREIGN,
			},
		]),
	);
	return { id, owner: users.owner, wallets: { base, foreign } };
};

type Row = {
	amount: string;
	base_amount: string | null;
	base_rate: string | null;
};

/** Every date this file uses (2015, which the rate tests' early dates never reach): asks for them fulfilled after. */
const used = [
	...Array.from({ length: 21 }, (_, i) => shiftCalendarDate("2015-01-01", i)),
	"2015-03-01",
	"2015-03-05",
	...Array.from({ length: 20 }, (_, i) => shiftCalendarDate("2015-06-01", i)),
];

describe("Base amounts", () => {
	beforeAll(clearRates);
	afterAll(async () => {
		for (const date of used)
			await must(
				admin.rpc("store_exchange_rates", { on_date: date, rates: {} }),
			);
		await clearRates();
	});

	it("are the market figure when the date's rates are held, an estimate until then, and the User's when edited", async () => {
		const h = await household();
		const api = userClient(h.owner);
		await store("2015-03-01", "0.377", "2");
		const entry = (extra: object) => ({
			id: uuidv7(),
			household_id: h.id,
			wallet_id: h.wallets.foreign,
			kind: "balance_adjustment",
			amount: "-10",
			occurred_on: "2015-03-01",
			created_by: h.owner.id,
			...extra,
		});
		const read = async (id: string) =>
			(
				(await must(
					admin
						.from("entries")
						.select("amount::text, base_amount::text, base_rate")
						.eq("id", id),
				)) as Row[]
			)[0];

		// What a device sends is the server's to set: the date's rates price it, 10 XTS × 0.377 ÷ 2.
		const market = entry({ base_amount: "-999", base_rate: "market" });
		await must(api.from("entries").insert(market));
		expect(await read(market.id)).toEqual({
			amount: "-10",
			base_amount: "-1.885",
			base_rate: "market",
		});

		// A date without its rates is estimated at the nearest held, and those rates are asked for.
		const estimated = entry({ occurred_on: "2015-03-05" });
		await must(api.from("entries").insert(estimated));
		expect(await read(estimated.id)).toMatchObject({
			base_amount: "-1.885",
			base_rate: "estimated",
		});
		const facts = (await must(admin.rpc("exchange_rate_facts"))) as {
			requested: { date: string }[];
		};
		expect(facts.requested.map((r) => r.date)).toContain("2015-03-05");

		// The User's own figure stays, whatever the rates.
		const edited = entry({
			occurred_on: "2015-03-05",
			base_amount: "-2",
			base_rate: "edited",
		});
		await must(api.from("entries").insert(edited));

		// Storing the date's rates corrects the estimate, never the edit.
		await store("2015-03-05", "0.4", "2");
		expect(await read(estimated.id)).toEqual({
			amount: "-10",
			base_amount: "-2.000",
			base_rate: "market",
		});
		expect(await read(edited.id)).toMatchObject({
			base_amount: "-2",
			base_rate: "edited",
		});

		// Taking the edit back prices it again; an edited figure must go the amount's way, in the Base's minor units.
		await must(
			api
				.from("entries")
				.update({ base_amount: null, base_rate: null })
				.eq("id", edited.id),
		);
		expect(await read(edited.id)).toMatchObject({
			base_amount: "-2.000",
			base_rate: "market",
		});
		for (const wrong of ["2", "-2.0001"]) {
			const { error } = await api
				.from("entries")
				.update({ base_amount: wrong, base_rate: "edited" })
				.eq("id", edited.id);
			expect(error?.code, wrong).toBe("23514");
		}

		// Changing the amount re-prices it; a Base-currency Entry never carries one.
		await must(
			api.from("entries").update({ amount: "-20" }).eq("id", market.id),
		);
		expect(await read(market.id)).toMatchObject({ base_amount: "-3.770" });
		const home = entry({
			wallet_id: h.wallets.base,
			base_amount: "-5",
			base_rate: "edited",
		});
		await must(api.from("entries").insert(home));
		expect(await read(home.id)).toEqual({
			amount: "-10",
			base_amount: null,
			base_rate: null,
		});
	});

	it("let a cross-household transfer's halves hold different amounts, each in its own Wallet's currency (#46)", async () => {
		const here = await household();
		const there = uuidv7();
		const away = uuidv7();
		await must(
			admin
				.from("households")
				.insert({ id: there, name: "Abroad", base_currency: FOREIGN }),
		);
		await must(
			admin.from("memberships").insert({
				id: uuidv7(),
				household_id: there,
				user_id: here.owner.id,
				role: "admin",
			}),
		);
		await must(
			admin.from("wallets").insert({
				id: away,
				household_id: there,
				name: "Away",
				type: "cash",
				currency: FOREIGN,
			}),
		);
		const api = userClient(here.owner);
		const link = uuidv7();
		const half = (household_id: string, wallet_id: string, amount: string) => ({
			id: uuidv7(),
			household_id,
			wallet_id,
			kind: "household_transfer",
			amount,
			link_id: link,
			occurred_on: "2015-03-01",
			created_by: here.owner.id,
		});
		const leaves = half(here.id, here.wallets.base, "-10");
		const arrives = half(there, away, "53.05");
		await must(api.from("entries").insert([leaves, arrives]));
		await must(
			api.from("entries").update({ amount: "60" }).eq("id", arrives.id),
		);
		const rows = (await must(
			admin
				.from("entries")
				.select("id, amount::text, base_rate")
				.eq("link_id", link)
				.order("amount"),
		)) as { id: string; amount: string; base_rate: string | null }[];
		expect(rows).toEqual([
			{ id: leaves.id, amount: "-10", base_rate: null },
			{ id: arrives.id, amount: "60", base_rate: null },
		]);
	});

	it("come out of the server as a device prices them, for any amounts, dates and rates", async () => {
		const h = await household();
		const rate = fc
			.tuple(
				fc.integer({ min: 1, max: 9_999_999 }),
				fc.integer({ min: 0, max: 6 }),
			)
			.map(([n, s]) => (n / 10 ** s).toFixed(s));
		await fc.assert(
			fc.asyncProperty(
				fc.uniqueArray(
					fc.record({
						day: fc.integer({ min: 0, max: 20 }),
						base: rate,
						foreign: rate,
					}),
					{ maxLength: 4, selector: (r) => r.day },
				),
				fc.array(
					fc.record({
						day: fc.integer({ min: 0, max: 20 }),
						cents: fc
							.integer({ min: -9_999_999, max: 9_999_999 })
							.filter((n) => n !== 0),
					}),
					{ minLength: 1, maxLength: 5 },
				),
				async (rateDays, entrySpec) => {
					await clearRates();
					await must(admin.from("entries").delete().eq("household_id", h.id));
					const day = (n: number) => shiftCalendarDate("2015-01-01", n);
					for (const r of rateDays) await store(day(r.day), r.base, r.foreign);
					const entries = entrySpec.map((e) => ({
						id: uuidv7(),
						household_id: h.id,
						wallet_id: h.wallets.foreign,
						kind: "balance_adjustment",
						amount: (e.cents / 100).toFixed(2),
						occurred_on: day(e.day),
						created_by: h.owner.id,
					}));
					await must(admin.from("entries").insert(entries));
					const rates = await heldRates();
					const rows = (await must(
						admin
							.from("entries")
							.select(
								"id, amount::text, occurred_on, base_amount::text, base_rate",
							)
							.eq("household_id", h.id),
					)) as (Row & { id: string; occurred_on: string })[];
					for (const row of rows) {
						const device = baseAmountOf({
							amount: parseMoney(row.amount, FOREIGN),
							baseCurrency: BASE,
							date: row.occurred_on,
							rates,
						});
						expect({
							amount:
								row.base_amount === null
									? null
									: parseMoney(row.base_amount, BASE).toString(),
							rate: row.base_rate,
						}).toEqual({
							amount: device?.amount?.toString() ?? null,
							rate: device?.rate,
						});
					}
				},
			),
			{ numRuns: 25 },
		);
	});

	it("count in Budget notifications as on the Budgets tab, itemized or not", async () => {
		const h = await household();
		const food = uuidv7();
		const fuel = uuidv7();
		await must(
			admin.from("categories").insert(
				[
					{ id: food, name: "B Food" },
					{ id: fuel, name: "B Fuel" },
				].map((c) => ({
					...c,
					household_id: h.id,
					kind: "expense",
					parent_id: null,
					icon: "gifts",
					color: "lime",
				})),
			),
		);
		const categories = (await must(
			admin
				.from("categories")
				.select("id, kind, parent_id, name, archived_at")
				.eq("household_id", h.id),
		)) as CategoryLike[];
		const today = "2015-06-20";
		const month = budgetMonthOf(today, 1);
		const amount = fc
			.integer({ min: 1, max: 40_000 })
			.map((n) => (n / 1000).toFixed(3));
		let reached = 0;

		await fc.assert(
			fc.asyncProperty(
				fc.tuple(amount, amount),
				fc.array(
					fc.record({
						foreign: fc.boolean(),
						category: fc.constantFrom(food, fuel),
						items: fc.array(
							fc.record({
								category: fc.constantFrom(food, fuel),
								cents: fc.integer({ min: 1, max: 50_000 }),
							}),
							{ maxLength: 3 },
						),
						day: fc.integer({ min: 0, max: 19 }),
						edited: fc.option(amount, { freq: 5 }),
					}),
					{ maxLength: 6 },
				),
				fc.boolean(),
				async ([foodBudget, fuelBudget], spec, withRates) => {
					await clearRates();
					for (const table of ["budgets", "entries"])
						await must(admin.from(table).delete().eq("household_id", h.id));
					if (withRates) await store("2015-06-01", "0.376", "1.7");
					const standing = [
						{ category: food, budget: foodBudget },
						{ category: fuel, budget: fuelBudget },
					].map(({ category, budget }, i) => ({
						id: uuidv7(),
						household_id: h.id,
						category_id: category,
						valid_from: month,
						amount: budget,
						created_at: new Date(Date.UTC(2015, 0, 1, 0, 0, i)).toISOString(),
					}));
					await must(admin.from("budgets").insert(standing));
					const items: object[] = [];
					const entries = spec.map((e) => {
						const id = uuidv7();
						const total = e.items.reduce((s, i) => s + i.cents, 0) || 1234;
						for (const [position, item] of e.items.entries())
							items.push({
								id: uuidv7(),
								household_id: h.id,
								entry_id: id,
								position,
								description: "Item",
								amount: (item.cents / 100).toFixed(2),
								category_id: item.category,
								rest: false,
							});
						return {
							id,
							household_id: h.id,
							wallet_id: e.foreign ? h.wallets.foreign : h.wallets.base,
							kind: "expense",
							amount: `-${(total / 100).toFixed(2)}`,
							category_id: e.category,
							occurred_on: shiftCalendarDate("2015-06-01", e.day),
							created_by: h.owner.id,
							...(e.foreign && e.edited
								? { base_amount: `-${e.edited}`, base_rate: "edited" }
								: {}),
						};
					});
					await must(admin.from("entries").insert(entries));
					if (items.length > 0)
						await must(admin.from("entry_items").insert(items));

					const levels = (await must(
						admin.rpc("budget_levels", {
							target_household: h.id,
							today,
							start_day: 1,
						}),
					)) as { category_id: string; level: number }[];
					const fromSql = levels
						.map((r) => `${r.category_id} ${r.level}`)
						.toSorted();

					const view = budgetMonthView({
						month,
						today,
						startDay: 1,
						currency: BASE,
						categories,
						standing,
						overrides: [],
						entries: (await must(
							admin
								.from("entries")
								.select(
									"id, kind, amount::text, category_id, occurred_on, base_amount::text, base_rate",
								)
								.eq("household_id", h.id),
						)) as never[],
						items: (await must(
							admin
								.from("entry_items")
								.select("entry_id, amount::text, category_id, position")
								.eq("household_id", h.id),
						)) as never[],
					});
					const fromDomain = view.budgets
						.flatMap(({ category: c, budget, used }) => {
							if (isZero(budget) || isNegative(budget)) return [];
							if (!isNegative(addMoney(used, negateMoney(budget))))
								return [`${c.id} 100`];
							return isNegative(
								addMoney(
									timesMoney(used, 5),
									negateMoney(timesMoney(budget, 4)),
								),
							)
								? []
								: [`${c.id} 80`];
						})
						.toSorted();
					expect(fromSql).toEqual(fromDomain);
					if (fromDomain.length > 0) reached += 1;
				},
			),
			{ numRuns: 30 },
		);
		expect(reached).toBeGreaterThan(0);
	});
});
