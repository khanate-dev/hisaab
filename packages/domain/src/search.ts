// Search (spec §3.4): on the device, one household at a time. A query is free text and amounts: `2500` finds Entries
// of exactly that much whichever way the money went (`-2500` too), `>2000`, `<500`, `>=` and `<=` compare (`> 2000`
// as well), and `"two words"` keeps a phrase together; every term must match. Amounts are compared as typed against
// each Entry in its own currency. The filter set narrows it further, and a Saved filter keeps the lot under a name,
// privately.

import {
	type BudgetMonth,
	budgetMonthOf,
	budgetMonthRange,
	shiftBudgetMonth,
} from "./budgets";
import { isCalendarDate } from "./dates";
import { magnitude } from "./entries";
import { compareMoney, isDecimalAmount, type Money, parseMoney } from "./money";

export type AmountComparison = "=" | ">" | "<" | ">=" | "<=";
export type AmountTerm = { comparison: AmountComparison; amount: string };
export type SearchQuery = { words: string[]; amounts: AmountTerm[] };

const COMPARISON = /^(>=|<=|>|<|=)$/;
// An optional comparison, an optional sign (the size is what's compared), and a number, with thousands separators
// only where they belong (`2,500`, never `1,2`).
const AMOUNT = /^(>=|<=|>|<|=)?-?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)$/;
// A phrase in double quotes (closed or still being typed), or a run of anything but whitespace.
const TOKEN = /"([^"]*)"?|(\S+)/g;

/** Free text and amount terms, as typed. A comparison on its own is joined to the number after it, else dropped. */
export const parseSearch = (text: string): SearchQuery => {
	const words: string[] = [];
	const amounts: AmountTerm[] = [];
	let pending: string | null = null;
	for (const [, phrase, bare] of text.matchAll(TOKEN)) {
		if (phrase !== undefined) {
			pending = null;
			const kept = phrase.trim().toLowerCase();
			if (kept !== "") words.push(kept);
			continue;
		}
		const token = bare ?? "";
		if (COMPARISON.test(token)) {
			pending = token;
			continue;
		}
		const amount = AMOUNT.exec(pending === null ? token : pending + token);
		const number = amount?.[2]?.replaceAll(",", "");
		if (amount && number !== undefined && isDecimalAmount(number))
			amounts.push({
				comparison: (amount[1] ?? "=") as AmountComparison,
				amount: number,
			});
		else words.push(token.toLowerCase());
		pending = null;
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
	/** Its Wallets' currencies. */
	currencies: readonly string[];
	/** A Loan's principal or Repayment: the Loan's Contact. */
	contactIds: readonly string[];
	createdBy: string;
	occurredOn: string;
	/** What free text matches: description, notes, Category, Wallet, Item and Contact names. */
	text: readonly string[];
	/** What amount terms match, whichever way the money went: the Entry's and its Items'. */
	amounts: readonly Money[];
};

/**
 * The filter set (spec §3.4, issue #10): an empty list or a null date doesn't narrow. Having an Attachment joins with
 * Attachments (#55).
 */
export type EntryFilter = {
	query: string;
	kinds: readonly string[];
	walletIds: readonly string[];
	categoryIds: readonly string[];
	currencies: readonly string[];
	/** Loans with these Contacts: their principals and Repayments. */
	contactIds: readonly string[];
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
	currencies: [],
	contactIds: [],
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
	if (!anyOf(filter.currencies, entry.currencies)) return false;
	if (!anyOf(filter.contactIds, entry.contactIds)) return false;
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

/** How many choices in the filter set (not the query) are on: each kind, Wallet, Category and so on, and each date. */
export const filtersOn = (filter: EntryFilter) =>
	filter.kinds.length +
	filter.walletIds.length +
	filter.categoryIds.length +
	filter.currencies.length +
	filter.contactIds.length +
	filter.memberIds.length +
	(filter.from === null ? 0 : 1) +
	(filter.to === null ? 0 : 1);

/** Whether a filter narrows anything at all. */
export const isFiltering = (filter: EntryFilter) =>
	filter.query.trim() !== "" || filtersOn(filter) > 0;

/** The choices a filter can be made of, as the household has them now. */
export type KnownChoices = {
	kinds: ReadonlySet<string>;
	walletIds: ReadonlySet<string>;
	categoryIds: ReadonlySet<string>;
	currencies: ReadonlySet<string>;
	contactIds: ReadonlySet<string>;
	memberIds: ReadonlySet<string>;
};

/** A filter with only the choices still there: a Saved filter naming a Wallet or Contact since gone drops it. */
export const keepKnown = (
	filter: EntryFilter,
	known: KnownChoices,
): EntryFilter => ({
	...filter,
	kinds: filter.kinds.filter((v) => known.kinds.has(v)),
	walletIds: filter.walletIds.filter((v) => known.walletIds.has(v)),
	categoryIds: filter.categoryIds.filter((v) => known.categoryIds.has(v)),
	currencies: filter.currencies.filter((v) => known.currencies.has(v)),
	contactIds: filter.contactIds.filter((v) => known.contactIds.has(v)),
	memberIds: filter.memberIds.filter((v) => known.memberIds.has(v)),
});

export type DatePreset =
	"this_month" | "last_month" | "last_3_months" | "this_year";
export const DATE_PRESETS: readonly DatePreset[] = [
	"this_month",
	"last_month",
	"last_3_months",
	"this_year",
];

/**
 * A date range preset in the household's Budget months, as the reports have them (spec §3.5): this Budget month, the
 * last one, the last three including this one, or the calendar year so far.
 */
export const presetRange = (
	preset: DatePreset,
	today: string,
	startDay: number,
): { from: string; to: string } => {
	const month: BudgetMonth = budgetMonthOf(today, startDay);
	const range = (first: BudgetMonth, last: BudgetMonth) => ({
		from: budgetMonthRange(first, startDay).first,
		to: budgetMonthRange(last, startDay).last,
	});
	switch (preset) {
		case "this_month":
			return range(month, month);
		case "last_month":
			return range(shiftBudgetMonth(month, -1), shiftBudgetMonth(month, -1));
		case "last_3_months":
			return range(shiftBudgetMonth(month, -2), month);
		case "this_year":
			return { from: `${today.slice(0, 4)}-01-01`, to: today };
	}
};

const strings = (value: unknown) =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: [];
const dateOrNull = (value: unknown) =>
	typeof value === "string" && isCalendarDate(value) ? value : null;

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
		currencies: strings(r.currencies),
		contactIds: strings(r.contactIds),
		memberIds: strings(r.memberIds),
		from: dateOrNull(r.from),
		to: dateOrNull(r.to),
	};
};

/** A filter as a Saved filter stores it. */
export const writeSavedCriteria = (filter: EntryFilter) =>
	JSON.stringify(filter);
