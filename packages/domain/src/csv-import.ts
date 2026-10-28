// CSV import (spec §3.4, issue #10 resolution 11): rows from a statement become ordinary Entries in one Wallet. The
// Admin maps columns (a date, a description, a single amount or debit and credit, an optional category), and the
// mapping is kept per Wallet. Likely duplicates (same date, amount and Wallet) are flagged before confirming. There are
// no importers for particular banks: any CSV, mapped by hand.

import { isCalendarDate } from "./dates";
import { magnitude } from "./entries";
import {
	isDecimalAmount,
	isZero,
	type Money,
	moneyEquals,
	negateMoney,
	parseMoney,
} from "./money";

/** RFC 4180 CSV: quoted fields with doubled quotes, commas and line breaks inside quotes, CRLF or LF, a BOM. */
export const parseCsv = (text: string): string[][] => {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	const input = text.startsWith("﻿") ? text.slice(1) : text;
	for (let i = 0; i < input.length; i += 1) {
		const c = input[i];
		if (quoted) {
			if (c === '"' && input[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"' && field === "") quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && input[i + 1] === "\n") i += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	// Blank lines (a lone empty field) carry nothing.
	return rows.filter((r) => !(r.length === 1 && r[0] === ""));
};

/** One CSV field as RFC 4180 writes it: quoted when it has to be. */
export const csvField = (value: string) =>
	/[",\r\n]/.test(value) || value.startsWith('"')
		? `"${value.replaceAll('"', '""')}"`
		: value;

export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** How a statement's columns map onto Entries; saved per Wallet. Columns are counted from 0. */
export type ImportMapping = {
	hasHeader: boolean;
	dateColumn: number;
	dateFormat: DateFormat;
	descriptionColumn: number | null;
	/** One signed amount (money in positive) or separate debit (out) and credit (in) columns. */
	amount:
		| {
				kind: "single";
				column: number;
				/** Money out is positive in this statement. */ outIsPositive: boolean;
		  }
		| { kind: "split"; debitColumn: number; creditColumn: number };
	categoryColumn: number | null;
};

/** A statement date in a mapping's format, as YYYY-MM-DD; null when it isn't a real date. */
export const readDate = (text: string, format: DateFormat): string | null => {
	const value = text.trim();
	const parts =
		format === "YYYY-MM-DD"
			? /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value)?.slice(1, 4)
			: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value)?.slice(1, 4);
	if (!parts) return null;
	const [a, b, c] = parts as [string, string, string];
	const [year, month, day] =
		format === "YYYY-MM-DD"
			? [a, b, c]
			: format === "DD/MM/YYYY"
				? [c, b, a]
				: [c, a, b];
	const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	return isCalendarDate(date) ? date : null;
};

/**
 * A statement amount as Money; null when it isn't one. Thousands separators, a currency code or symbol and spaces are
 * dropped, and `(1,200.00)` or a trailing `-` reads as negative. An empty field is null too.
 */
export const readAmount = (text: string, currency: string): Money | null => {
	let value = text.trim();
	if (value === "") return null;
	let negative = false;
	if (/^\(.*\)$/.test(value)) {
		negative = true;
		value = value.slice(1, -1);
	}
	if (value.endsWith("-")) {
		negative = !negative;
		value = value.slice(0, -1);
	}
	value = value.replace(/[A-Za-z$€£¥₹₨\s]/g, "").replaceAll(",", "");
	if (value.startsWith("-")) {
		negative = !negative;
		value = value.slice(1);
	} else if (value.startsWith("+")) value = value.slice(1);
	if (!isDecimalAmount(value)) return null;
	const money = parseMoney(value, currency);
	return negative ? negateMoney(money) : money;
};

/** A statement row read through a mapping: money in is positive, money out negative. */
export type ImportRow = {
	/** Its line in the file, from 1, for pointing at problems. */
	line: number;
	occurredOn: string;
	description: string | null;
	amount: Money;
	categoryName: string | null;
};

export type RowProblem = { line: number; reason: "date" | "amount" | "zero" };

/** Every data row read through a mapping, and the lines that couldn't be. */
export const readRows = (
	rows: readonly (readonly string[])[],
	mapping: ImportMapping,
	currency: string,
): { rows: ImportRow[]; problems: RowProblem[] } => {
	const read: ImportRow[] = [];
	const problems: RowProblem[] = [];
	const cell = (row: readonly string[], column: number | null) =>
		column === null ? "" : (row[column] ?? "").trim();
	for (const [index, row] of rows.entries()) {
		if (mapping.hasHeader && index === 0) continue;
		const line = index + 1;
		const occurredOn = readDate(
			cell(row, mapping.dateColumn),
			mapping.dateFormat,
		);
		if (occurredOn === null) {
			problems.push({ line, reason: "date" });
			continue;
		}
		const amount = signed(row, mapping.amount, cell, currency);
		if (amount === null) {
			problems.push({ line, reason: "amount" });
			continue;
		}
		if (isZero(amount)) {
			problems.push({ line, reason: "zero" });
			continue;
		}
		const description = cell(row, mapping.descriptionColumn);
		const category = cell(row, mapping.categoryColumn);
		read.push({
			line,
			occurredOn,
			description: description === "" ? null : description.slice(0, 200),
			amount,
			categoryName: category === "" ? null : category,
		});
	}
	return { rows: read, problems };
};

/** A row's amount, money in positive: a single column (flipped if the statement shows money out as positive), or a
 * debit (out) or credit (in) column, whichever has a non-zero amount, each read by its size. */
const signed = (
	row: readonly string[],
	amount: ImportMapping["amount"],
	cell: (row: readonly string[], column: number | null) => string,
	currency: string,
): Money | null => {
	if (amount.kind === "single") {
		const value = readAmount(cell(row, amount.column), currency);
		return value && amount.outIsPositive ? negateMoney(value) : value;
	}
	const out = readAmount(cell(row, amount.debitColumn), currency);
	const into = readAmount(cell(row, amount.creditColumn), currency);
	if (out && !isZero(out)) return negateMoney(magnitude(out));
	if (into && !isZero(into)) return magnitude(into);
	return out ?? into;
};

/** An Entry already in the Wallet, as duplicate detection needs it. */
export type ExistingEntry = { occurred_on: string; amount: string };

/**
 * The lines that are likely duplicates (spec: same date, amount and Wallet): of an Entry already in the Wallet, or of
 * an earlier row in the same file. Flagged, not dropped; the Admin decides.
 */
export const likelyDuplicates = (
	rows: readonly ImportRow[],
	existing: readonly ExistingEntry[],
	currency: string,
): Set<number> => {
	const flagged = new Set<number>();
	const same = (
		a: { occurredOn: string; amount: Money },
		b: { occurredOn: string; amount: Money },
	) => a.occurredOn === b.occurredOn && moneyEquals(a.amount, b.amount);
	const already = existing.map((e) => ({
		occurredOn: e.occurred_on,
		amount: parseMoney(e.amount, currency),
	}));
	rows.forEach((row, i) => {
		if (
			already.some((e) => same(e, row)) ||
			rows.slice(0, i).some((earlier) => same(earlier, row))
		)
			flagged.add(row.line);
	});
	return flagged;
};

/** Reads back a saved mapping, or null when it's missing or malformed, so an odd row never breaks the import. */
export const readMapping = (
	json: string | null | undefined,
): ImportMapping | null => {
	if (!json) return null;
	try {
		const raw = JSON.parse(json) as Partial<ImportMapping> | null;
		const column = (n: unknown) =>
			Number.isInteger(n) && (n as number) >= 0 ? (n as number) : null;
		if (!raw || typeof raw !== "object") return null;
		const dateColumn = column(raw.dateColumn);
		const amount = raw.amount;
		if (dateColumn === null || !amount || typeof amount !== "object")
			return null;
		const format = DATE_FORMATS.find((f) => f === raw.dateFormat);
		if (!format) return null;
		let mapped: ImportMapping["amount"] | null = null;
		if (amount.kind === "single" && column(amount.column) !== null)
			mapped = {
				kind: "single",
				column: amount.column,
				outIsPositive: amount.outIsPositive === true,
			};
		if (
			amount.kind === "split" &&
			column(amount.debitColumn) !== null &&
			column(amount.creditColumn) !== null
		)
			mapped = {
				kind: "split",
				debitColumn: amount.debitColumn,
				creditColumn: amount.creditColumn,
			};
		if (!mapped) return null;
		return {
			hasHeader: raw.hasHeader === true,
			dateColumn,
			dateFormat: format,
			descriptionColumn: column(raw.descriptionColumn),
			amount: mapped,
			categoryColumn: column(raw.categoryColumn),
		};
	} catch {
		return null;
	}
};
