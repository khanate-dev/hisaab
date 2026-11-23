import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	FETCHES_PER_RUN,
	fetchExchangeRates,
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
const anyFacts = fc.record({
	todayHeld: fc.boolean(),
	todayLastAttemptAt: lastAttempt,
	requested: fc.uniqueArray(
		fc.record({ date: pastDate, lastAttemptAt: lastAttempt }),
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
						{ date: "2026-01-05", lastAttemptAt: null },
						{ date: "2025-12-31", lastAttemptAt: null },
					],
				}),
				NOW,
			),
		).toEqual([TODAY, "2026-01-05", "2025-12-31"]);
		expect(pickRateDates(facts(), new Date("2026-11-23T00:30:00Z"))).toEqual(
			[],
		);
		expect(pickRateDates(facts({ todayHeld: true }), NOW)).toEqual([]);
	});

	it("never goes past the month's quota or a run's worth, nor retries within the hour, nor fetches a held or future date", () => {
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
					const last =
						date === TODAY
							? f.todayLastAttemptAt
							: f.requested.find((r) => r.date === date)?.lastAttemptAt;
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
				return Object.keys(rates).length;
			},
		};
		return { adapters, recorded, stored, calls };
	};

	it("takes today from latest and past dates from history, counting every try, and carries on past a failure", async () => {
		const { adapters, recorded, stored, calls } = fake(
			facts({
				requested: [
					{ date: "2026-01-05", lastAttemptAt: null },
					{ date: "2025-12-31", lastAttemptAt: null },
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

	it("never fetches more than it recorded, so the quota counts every request", async () => {
		await fc.assert(
			fc.asyncProperty(anyFacts, async (f) => {
				const { adapters, recorded, calls } = fake(f);
				await fetchExchangeRates(adapters, NOW);
				expect(calls.map(([date]) => date)).toEqual(recorded);
			}),
		);
	});
});
