// Search (spec §3.4): on the device, one household at a time. A query is free text and amounts: `2500` finds Entries
// of exactly that much, `>2000`, `<500`, `>=` and `<=` compare, and `"two words"` keeps a phrase together; every term
// must match. The full filter set narrows it further, and a Saved filter keeps the lot under a name, privately.

import { magnitude } from "./entries";
import { compareMoney, isDecimalAmount, type Money, parseMoney } from "./money";

export type AmountComparison = "=" | ">" | "<" | ">=" | "<=";
export type AmountTerm = { comparison: AmountComparison; amount: string };
export type SearchQuery = { words: string[]; amounts: AmountTerm[] };

const AMOUNT = /^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/;
// A phrase in double quotes, or a run of anything but whitespace.
const TOKEN = /"([^"]*)"|(\S+)/g;

/** Free text and amount terms, as typed. Thousands separators in an amount (`2,500`) are dropped. */
export const parseSearch = (text: string): SearchQuery => {
	const words: string[] = [];
	const amounts: AmountTerm[] = [];
	for (const [, phrase, bare] of text.matchAll(TOKEN)) {
		if (phrase !== undefined) {
			const kept = phrase.trim().toLowerCase();
			if (kept !== "") words.push(kept);
			continue;
		}
		const token = bare ?? "";
		const amount = AMOUNT.exec(token.replaceAll(",", ""));
		if (amount && isDecimalAmount(amount[2] ?? ""))
			amounts.push({
				comparison: (amount[1] ?? "=") as AmountComparison,
				amount: amount[2] ?? "",
			});
		else words.push(token.toLowerCase());
	}
	return { words, amounts };
};

const holds = (comparison: AmountComparison, order: number) => {
	switch (comparison) {
		case "=":
			return order === 0;
		case ">":
			return order > 0;
		case "<":
			return order < 0;
		case ">=":
			return order >= 0;
		case "<=":
			return order <= 0;
	}
};

/** An Entry as search reads it. */
export type Searchable = {
	kind: string;
	/** Its Wallet, and a Transfer's other one. */
	walletIds: readonly string[];
	/** Its Category and its Items', each with its parent. */
	categoryIds: readonly string[];
	createdBy: string;
	occurredOn: string;
	/** What free text matches: description, notes, Category, Wallet and Item names. */
	text: readonly string[];
	/** What amount terms match, whichever way the money went: the Entry's and its Items'. */
	amounts: readonly Money[];
};

/** The full filter set (spec §3.4); an empty list or a null date doesn't narrow. */
export type EntryFilter = {
	query: string;
	kinds: readonly string[];
	walletIds: readonly string[];
	categoryIds: readonly string[];
	/** Who recorded it. */
	memberIds: readonly string[];
	/** YYYY-MM-DD, both included. */
	from: string | null;
	to: string | null;
};

export const NO_FILTER: EntryFilter = {
	query: "",
	kinds: [],
	walletIds: [],
	categoryIds: [],
	memberIds: [],
	from: null,
	to: null,
};

const anyOf = (wanted: readonly string[], have: readonly string[]) =>
	wanted.length === 0 || have.some((id) => wanted.includes(id));

/** Whether an Entry matches a parsed query and the filters; every term and every filter must hold. */
export const matchesFilter = (
	entry: Searchable,
	filter: EntryFilter,
	query: SearchQuery = parseSearch(filter.query),
) => {
	if (filter.kinds.length > 0 && !filter.kinds.includes(entry.kind))
		return false;
	if (!anyOf(filter.walletIds, entry.walletIds)) return false;
	if (!anyOf(filter.categoryIds, entry.categoryIds)) return false;
	if (
		filter.memberIds.length > 0 &&
		!filter.memberIds.includes(entry.createdBy)
	)
		return false;
	if (filter.from !== null && entry.occurredOn < filter.from) return false;
	if (filter.to !== null && entry.occurredOn > filter.to) return false;
	const text = entry.text.map((t) => t.toLowerCase());
	if (!query.words.every((word) => text.some((t) => t.includes(word))))
		return false;
	return query.amounts.every(({ comparison, amount }) =>
		entry.amounts.some((money) =>
			holds(
				comparison,
				compareMoney(magnitude(money), parseMoney(amount, money.currency)),
			),
		),
	);
};

/** The Entries matching a filter, in the order given. */
export const filterEntries = <T>(
	entries: readonly T[],
	searchable: (entry: T) => Searchable,
	filter: EntryFilter,
) => {
	const query = parseSearch(filter.query);
	return entries.filter((entry) =>
		matchesFilter(searchable(entry), filter, query),
	);
};

/** Whether a filter narrows anything at all. */
export const isFiltering = (filter: EntryFilter) =>
	filter.query.trim() !== "" ||
	filter.kinds.length > 0 ||
	filter.walletIds.length > 0 ||
	filter.categoryIds.length > 0 ||
	filter.memberIds.length > 0 ||
	filter.from !== null ||
	filter.to !== null;

const strings = (value: unknown) =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: [];
const dateOrNull = (value: unknown) =>
	typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/**
 * A Saved filter's criteria read back from its stored JSON. Whatever a newer build added is dropped and whatever is
 * missing or malformed reads as not filtering, so an old or odd row never breaks search.
 */
export const readSavedCriteria = (json: string): EntryFilter => {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return NO_FILTER;
	}
	if (typeof raw !== "object" || raw === null) return NO_FILTER;
	const r = raw as Record<string, unknown>;
	return {
		query: typeof r.query === "string" ? r.query : "",
		kinds: strings(r.kinds),
		walletIds: strings(r.walletIds),
		categoryIds: strings(r.categoryIds),
		memberIds: strings(r.memberIds),
		from: dateOrNull(r.from),
		to: dateOrNull(r.to),
	};
};

/** A filter as a Saved filter stores it. */
export const writeSavedCriteria = (filter: EntryFilter) =>
	JSON.stringify(filter);
