import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { compareMoney, parseMoney } from "./money";
import {
	type EntryFilter,
	filterEntries,
	isFiltering,
	matchesFilter,
	NO_FILTER,
	parseSearch,
	readSavedCriteria,
	type Searchable,
	writeSavedCriteria,
} from "./search";

const entry = (more: Partial<Searchable> = {}): Searchable => ({
	kind: "expense",
	walletIds: ["w1"],
	categoryIds: ["groceries", "food"],
	createdBy: "u1",
	occurredOn: "2026-10-20",
	text: ["Weekly shop", "Groceries", "Cash"],
	amounts: [parseMoney("-2500", "PKR")],
	...more,
});

const searchable: fc.Arbitrary<Searchable> = fc.record({
	kind: fc.constantFrom("expense", "income", "transfer"),
	walletIds: fc.subarray(["w1", "w2", "w3"], { minLength: 1 }),
	categoryIds: fc.subarray(["food", "groceries", "rent"]),
	createdBy: fc.constantFrom("u1", "u2"),
	occurredOn: fc.constantFrom(
		"2026-09-30",
		"2026-10-01",
		"2026-10-15",
		"2026-10-31",
	),
	text: fc.array(
		fc.constantFrom("Weekly shop", "Rent", "Milk", "Cash", "HBL"),
		{ maxLength: 3 },
	),
	amounts: fc.array(
		fc
			.integer({ min: -100_000, max: 100_000 })
			.map((n) => parseMoney(String(n), "PKR")),
		{ minLength: 1, maxLength: 3 },
	),
});

const filter: fc.Arbitrary<EntryFilter> = fc.record({
	query: fc.constantFrom(
		"",
		"shop",
		"milk cash",
		">2000",
		"<=500",
		"2500",
		'"weekly shop"',
		"rent >100",
	),
	kinds: fc.subarray(["expense", "income", "transfer"]),
	walletIds: fc.subarray(["w1", "w2", "w3"]),
	categoryIds: fc.subarray(["food", "groceries", "rent"]),
	memberIds: fc.subarray(["u1", "u2"]),
	from: fc.constantFrom(null, "2026-10-01"),
	to: fc.constantFrom(null, "2026-10-15"),
});

describe("parseSearch", () => {
	it("reads free text, amounts and quoted phrases", () => {
		expect(parseSearch('Milk  >2000 "weekly shop" 2,500 <=10.5 >x')).toEqual({
			words: ["milk", "weekly shop", ">x"],
			amounts: [
				{ comparison: ">", amount: "2000" },
				{ comparison: "=", amount: "2500" },
				{ comparison: "<=", amount: "10.5" },
			],
		});
	});
});

describe("matchesFilter", () => {
	it("matches an exact amount whichever way the money went, and comparisons on its size", () => {
		const shop = entry();
		expect(matchesFilter(shop, { ...NO_FILTER, query: "2500" })).toBe(true);
		expect(matchesFilter(shop, { ...NO_FILTER, query: ">2000" })).toBe(true);
		expect(matchesFilter(shop, { ...NO_FILTER, query: "<2500" })).toBe(false);
		expect(matchesFilter(shop, { ...NO_FILTER, query: "weekly >=2500" })).toBe(
			true,
		);
		expect(matchesFilter(shop, { ...NO_FILTER, query: "weekly rent" })).toBe(
			false,
		);
	});

	it("finds a Subcategory's Entries under its parent", () => {
		expect(
			matchesFilter(entry(), { ...NO_FILTER, categoryIds: ["food"] }),
		).toBe(true);
	});

	it("lets everything through with no filter", () => {
		fc.assert(
			fc.property(searchable, (e) => {
				expect(matchesFilter(e, NO_FILTER)).toBe(true);
			}),
		);
	});

	it("is the meet of its parts: a filter matches exactly when each of its criteria alone does", () => {
		fc.assert(
			fc.property(searchable, filter, (e, f) => {
				const alone: EntryFilter[] = [
					{ ...NO_FILTER, query: f.query },
					{ ...NO_FILTER, kinds: f.kinds },
					{ ...NO_FILTER, walletIds: f.walletIds },
					{ ...NO_FILTER, categoryIds: f.categoryIds },
					{ ...NO_FILTER, memberIds: f.memberIds },
					{ ...NO_FILTER, from: f.from, to: f.to },
				];
				expect(matchesFilter(e, f)).toBe(
					alone.every((part) => matchesFilter(e, part)),
				);
			}),
		);
	});

	it("splits Entries by an amount: more than it, or at most it", () => {
		fc.assert(
			fc.property(searchable, fc.integer({ min: 0, max: 100_000 }), (e, n) => {
				const one = { ...e, amounts: e.amounts.slice(0, 1) };
				const more = matchesFilter(one, { ...NO_FILTER, query: `>${n}` });
				const most = matchesFilter(one, { ...NO_FILTER, query: `<=${n}` });
				expect(more).not.toBe(most);
			}),
		);
	});

	it("ignores case and the order of words", () => {
		fc.assert(
			fc.property(
				searchable,
				fc.constantFrom(["weekly", "shop"], ["cash", "milk"], ["rent"]),
				(e, words) => {
					const forward = matchesFilter(e, {
						...NO_FILTER,
						query: words.join(" "),
					});
					const shouted = matchesFilter(e, {
						...NO_FILTER,
						query: words.toReversed().join(" ").toUpperCase(),
					});
					expect(shouted).toBe(forward);
				},
			),
		);
	});
});

describe("filterEntries", () => {
	it("keeps the matching Entries in their order, a subset of what it's given", () => {
		fc.assert(
			fc.property(
				fc.array(searchable, { maxLength: 10 }),
				filter,
				(entries, f) => {
					const kept = filterEntries(entries, (e) => e, f);
					expect(kept).toEqual(entries.filter((e) => matchesFilter(e, f)));
				},
			),
		);
	});
});

describe("Saved filter criteria", () => {
	it("round-trip through their stored form", () => {
		fc.assert(
			fc.property(filter, (f) => {
				expect(readSavedCriteria(writeSavedCriteria(f))).toEqual(f);
			}),
		);
	});

	it("read anything odd as not filtering, dropping what a newer build added", () => {
		expect(readSavedCriteria("not json")).toEqual(NO_FILTER);
		expect(readSavedCriteria("null")).toEqual(NO_FILTER);
		expect(
			isFiltering(
				readSavedCriteria('{"kinds":"expense","from":"soon","extra":1}'),
			),
		).toBe(false);
		expect(readSavedCriteria('{"query":"rent","kinds":["income",3]}')).toEqual({
			...NO_FILTER,
			query: "rent",
			kinds: ["income"],
		});
	});
});

describe("compareMoney", () => {
	it("orders amounts exactly, and is antisymmetric", () => {
		fc.assert(
			fc.property(fc.integer(), fc.integer(), (a, b) => {
				const x = parseMoney(`${a}.01`, "PKR");
				const y = parseMoney(String(b), "PKR");
				expect(compareMoney(x, y)).toBe(-compareMoney(y, x));
				expect(compareMoney(x, x)).toBe(0);
			}),
		);
	});
});
