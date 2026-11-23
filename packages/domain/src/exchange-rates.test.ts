import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	FETCHES_PER_RUN,
	fetchExchangeRates,
	MAX_TRIES,
	MONTHLY_FETCHES,
	pickRateDates,
	type RateAdapters,
	type RateFacts,
	readOxrRates,
	RETRY_AFTER_MS,
} from "./exchange-rates";

const NOW = new Date("2026-11-23T08:00:00Z");
const TODAY = "2026-11-23";
const facts = (over: Partial<RateFacts> = {}): RateFacts => ({
	todayHeld: false,
	todayLastAttemptAt: null,
	todayAttempts: 0,
	requested: [],
	fetchesThisMonth: 0,
	...over,
});
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const pastDate = fc
	.integer({ min: 1, max: 9000 })
	.map((days) =>
		new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10),
	);
const lastAttempt = fc.option(
	fc.integer({ min: 0, max: 3 * RETRY_AFTER_MS }).map(ago),
);
const tries = fc.integer({ min: 0, max: MAX_TRIES + 2 });
const anyFacts = fc.record({
	todayHeld: fc.boolean(),
	todayLastAttemptAt: lastAttempt,
	todayAttempts: tries,
	requested: fc.uniqueArray(
		fc.record({ date: pastDate, lastAttemptAt: lastAttempt, attempts: tries }),
		{ selector: (r) => r.date, maxLength: 40 },
	),
	fetchesThisMonth: fc.integer({ min: 0, max: 1000 }),
});

describe("pickRateDates", () => {
	it("fetches today first, once it's due, then the dates asked for in the order asked", () => {
		expect(
			pickRateDates(
				facts({
					requested: [
						{ date: "2026-01-05", lastAttemptAt: null, attempts: 0 },
						{ date: "2025-12-31", lastAttemptAt: null, attempts: 0 },
					],
				}),
				NOW,
			),
		).toEqual([TODAY, "2026-01-05", "2025-12-31"]);
		expect(pickRateDates(facts(), new Date("2026-11-23T00:30:00Z"))).toEqual(
			[],
		);
		expect(pickRateDates(facts({ todayHeld: true }), NOW)).toEqual([]);
		expect(
			pickRateDates(
				facts({
					todayAttempts: MAX_TRIES,
					requested: [
						{ date: "2026-01-05", lastAttemptAt: null, attempts: MAX_TRIES },
					],
				}),
				NOW,
			),
		).toEqual([]);
	});

	it("never goes past the month's quota or a run's worth, nor retries within the hour or past its tries, nor fetches a held or future date", () => {
		fc.assert(
			fc.property(anyFacts, (f) => {
				const picked = pickRateDates(f, NOW);
				expect(picked.length).toBeLessThanOrEqual(FETCHES_PER_RUN);
				expect(f.fetchesThisMonth + picked.length).toBeLessThanOrEqual(
					Math.max(MONTHLY_FETCHES, f.fetchesThisMonth),
				);
				expect(new Set(picked).size).toBe(picked.length);
				for (const date of picked) {
					expect(date <= TODAY).toBe(true);
					const asked = f.requested.find((r) => r.date === date);
					const last =
						date === TODAY ? f.todayLastAttemptAt : asked?.lastAttemptAt;
					expect(
						date === TODAY ? f.todayAttempts : (asked?.attempts ?? 0),
					).toBeLessThan(MAX_TRIES);
					if (last)
						expect(NOW.getTime() - Date.parse(last)).toBeGreaterThanOrEqual(
							RETRY_AFTER_MS,
						);
				}
				if (f.todayHeld) expect(picked).not.toContain(TODAY);
			}),
		);
	});
});

describe("readOxrRates", () => {
	it("keeps each rate exactly as OXR wrote it", () => {
		expect(
			readOxrRates(
				'{"timestamp":1,"base":"USD","rates":{"PKR":278.755000,"USD":1,"BTC":1.34e-05,"EUR":0.9216123456789012345}}',
			),
		).toEqual({
			PKR: "278.755000",
			USD: "1",
			BTC: "1.34e-05",
			EUR: "0.9216123456789012345",
		});
	});

	it("gives back any rate's text unchanged", () => {
		const rateText = fc
			.tuple(
				fc.bigInt({ min: 1n, max: 10n ** 12n }),
				fc.integer({ min: 0, max: 12 }),
				fc.constantFrom("", "0", "00"),
			)
			.map(([digits, scale, zeros]) => {
				const text = digits.toString().padStart(scale + 1, "0");
				return scale === 0
					? text
					: `${text.slice(0, -scale)}.${text.slice(-scale)}${zeros}`;
			});
		fc.assert(
			fc.property(rateText, (rate) => {
				expect(readOxrRates(`{"base":"USD","rates":{"PKR":${rate}}}`)).toEqual({
					PKR: rate,
				});
			}),
		);
	});

	it("leaves out codes and rates that can't be right, and refuses anything not USD-based", () => {
		expect(
			readOxrRates(
				'{"base":"USD","rates":{"pkr":1,"XXXX":1,"ZWL":0,"AAA":-2,"BBB":"3","CCC":null}}',
			),
		).toEqual({});
		expect(() => readOxrRates('{"base":"EUR","rates":{}}')).toThrow();
		expect(() => readOxrRates('{"error":true,"status":401}')).toThrow();
		expect(() => readOxrRates("not json")).toThrow();
	});
});

describe("fetchExchangeRates", () => {
	const fake = (state: RateFacts, failing: string[] = []) => {
		const recorded: string[] = [];
		const stored = new Map<string, Record<string, string>>();
		const calls: [string, boolean][] = [];
		const adapters: RateAdapters = {
			facts: async () => state,
			recordFetch: async (date) => {
				recorded.push(date);
			},
			fetchRates: async (date, latest) => {
				calls.push([date, latest]);
				if (failing.includes(date)) throw new Error("OXR 500");
				return '{"base":"USD","rates":{"PKR":280.5,"USD":1}}';
			},
			store: async (date, rates) => {
				stored.set(date, rates);
			},
		};
		return { adapters, recorded, stored, calls };
	};

	it("takes today from latest and past dates from history, counting every try, and carries on past a failure", async () => {
		const { adapters, recorded, stored, calls } = fake(
			facts({
				requested: [
					{ date: "2026-01-05", lastAttemptAt: null, attempts: 0 },
					{ date: "2025-12-31", lastAttemptAt: null, attempts: 0 },
				],
			}),
			["2026-01-05"],
		);
		expect(await fetchExchangeRates(adapters, NOW)).toEqual({
			fetched: [TODAY, "2025-12-31"],
			failed: [{ date: "2026-01-05", reason: "OXR 500" }],
		});
		expect(calls).toEqual([
			[TODAY, true],
			["2026-01-05", false],
			["2025-12-31", false],
		]);
		expect(recorded).toEqual([TODAY, "2026-01-05", "2025-12-31"]);
		expect(stored.get(TODAY)).toEqual({ PKR: "280.5", USD: "1" });
		expect(stored.has("2026-01-05")).toBe(false);
	});

	it("counts a response with no usable rate as failed, storing nothing", async () => {
		const { adapters, stored } = fake(facts());
		adapters.fetchRates = async () => '{"base":"USD","rates":{"pkr":1}}';
		expect(await fetchExchangeRates(adapters, NOW)).toEqual({
			fetched: [],
			failed: [{ date: TODAY, reason: "OXR gave no usable rates" }],
		});
		expect(stored.size).toBe(0);
	});

	it("records every date before fetching any, so the quota counts every request", async () => {
		await fc.assert(
			fc.asyncProperty(anyFacts, async (f) => {
				const order: string[] = [];
				const { adapters, recorded, calls } = fake(f);
				const record = adapters.recordFetch;
				adapters.recordFetch = async (date) => {
					order.push("record");
					await record(date);
				};
				const fetchRates = adapters.fetchRates;
				adapters.fetchRates = async (date, latest) => {
					order.push("fetch");
					return fetchRates(date, latest);
				};
				await fetchExchangeRates(adapters, NOW);
				expect(calls.map(([date]) => date)).toEqual(recorded);
				expect(order.lastIndexOf("record")).toBeLessThan(
					order.includes("fetch") ? order.indexOf("fetch") : Infinity,
				);
			}),
		);
	});
});
