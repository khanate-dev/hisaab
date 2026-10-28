// CSV import (spec §3.4, issue #10 resolution 11): rows from a statement become ordinary Entries in one Wallet. The
// Admin maps columns (a date, a description, a single amount or debit and credit, an optional category), and the
// mapping is kept per Wallet. Likely duplicates (same date, amount and Wallet) are flagged before confirming. There are
// no importers for particular banks: any CSV, mapped by hand.

import { isCalendarDate } from "./dates";
import { magnitude } from "./entries";
import {
	currencyDecimals,
	isZero,
	type Money,
	negateMoney,
	parseMoney,
} from "./money";

/** A CSV record and the line of the file it starts on, from 1 (a quoted field can run over several lines). */
export type CsvRecord = { line: number; cells: string[] };

/**
 * RFC 4180 CSV: quoted fields with doubled quotes, commas and line breaks inside quotes, CRLF or LF, a BOM. Blank
 * lines are skipped. `unclosedAt` is the line of a quote never closed, after which nothing is trusted (so nothing is
 * read); null when every quote closes.
 */
export const parseCsv = (
	text: string,
): { records: CsvRecord[]; unclosedAt: number | null } => {
	const records: CsvRecord[] = [];
	let cells: string[] = [];
	let field = "";
	let quoted = false;
	let quoteLine = 0;
	let line = 1;
	let start = 1;
	const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
	const end = () => {
		cells.push(field);
		if (!(cells.length === 1 && cells[0] === ""))
			records.push({ line: start, cells });
		cells = [];
		field = "";
	};
	for (let i = 0; i < input.length; i += 1) {
		const c = input[i];
		if (quoted) {
			if (c === '"' && input[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (c === '"') quoted = false;
			else {
				if (c === "\n") line += 1;
				field += c;
			}
		} else if (c === '"' && field === "") {
			quoted = true;
			quoteLine = line;
		} else if (c === ",") {
			cells.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && input[i + 1] === "\n") i += 1;
			end();
			line += 1;
			start = line;
		} else field += c;
	}
	if (quoted)
		return {
			records: records.filter((r) => r.line < quoteLine),
			unclosedAt: quoteLine,
		};
	if (field !== "" || cells.length > 0) end();
	return { records, unclosedAt: null };
};

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

// What a statement amount may be dressed in, and nothing else: a currency code or symbol before it, a sign, thousands
// separators where they belong, a decimal point, a trailing minus or DR/CR, or accounting parentheses. A decimal
// comma (`1.234,50`), an exponent or anything unexpected is refused rather than guessed at.
const STATEMENT_AMOUNT =
	/^(\()?\s*(?:[A-Za-z]{1,3}\.?|[$€£¥₹₨])?\s*([+-])?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(-|DR|CR)?\s*(\))?$/i;

/**
 * A statement amount as Money; null when it isn't one, or has more decimals than its currency (so a misread never
 * imports the wrong money). `(1,200.00)`, a trailing `-` or `DR` read as money out; `CR` as money in.
 */
export const readAmount = (text: string, currency: string): Money | null => {
	const match = STATEMENT_AMOUNT.exec(text.trim());
	if (!match) return null;
	const [, open, sign, whole, fraction = "", suffix, close] = match;
	if ((open === undefined) !== (close === undefined)) return null;
	const marks = [
		open !== undefined,
		sign === "-",
		suffix === "-" || suffix?.toUpperCase() === "DR",
	].filter(Boolean);
	if (marks.length > 1 || (sign !== undefined && suffix !== undefined))
		return null;
	if (fraction.length - 1 > currencyDecimals(currency)) return null;
	const money = parseMoney(
		`${(whole ?? "").replaceAll(",", "")}${fraction}`,
		currency,
	);
	return marks.length === 1 ? negateMoney(money) : money;
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

export type RowProblem = {
	line: number;
	reason: "date" | "amount" | "zero" | "both";
};

/** Every data row read through a mapping, and the lines that couldn't be. */
export const readRows = (
	records: readonly CsvRecord[],
	mapping: ImportMapping,
	currency: string,
): { rows: ImportRow[]; problems: RowProblem[] } => {
	const read: ImportRow[] = [];
	const problems: RowProblem[] = [];
	const cell = (row: readonly string[], column: number | null) =>
		column === null ? "" : (row[column] ?? "").trim();
	for (const [index, { line, cells: row }] of records.entries()) {
		if (mapping.hasHeader && index === 0) continue;
		const occurredOn = readDate(
			cell(row, mapping.dateColumn),
			mapping.dateFormat,
		);
		if (occurredOn === null) {
			problems.push({ line, reason: "date" });
			continue;
		}
		const amount = signed(row, mapping.amount, cell, currency);
		if (amount === "both") {
			problems.push({ line, reason: "both" });
			continue;
		}
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

/**
 * A row's amount, money in positive: a single column (flipped if the statement shows money out as positive), or a
 * debit (out) or credit (in) column, each read by its size; "both" when each has a non-zero amount, as which one is
 * meant can't be told.
 */
const signed = (
	row: readonly string[],
	amount: ImportMapping["amount"],
	cell: (row: readonly string[], column: number | null) => string,
	currency: string,
): Money | "both" | null => {
	if (amount.kind === "single") {
		const value = readAmount(cell(row, amount.column), currency);
		return value && amount.outIsPositive ? negateMoney(value) : value;
	}
	const out = readAmount(cell(row, amount.debitColumn), currency);
	const into = readAmount(cell(row, amount.creditColumn), currency);
	if (out && !isZero(out) && into && !isZero(into)) return "both";
	if (out && !isZero(out)) return negateMoney(magnitude(out));
	if (into && !isZero(into)) return magnitude(into);
	return out ?? into;
};

/** An Entry already in the Wallet, as duplicate detection needs it. */
export type ExistingEntry = { occurred_on: string; amount: string };

/**
 * The lines that are likely duplicates (spec: same date, amount and Wallet) of an Entry already in the Wallet. Flagged
 * for the Admin to decide on, never dropped here.
 */
export const likelyDuplicates = (
	rows: readonly ImportRow[],
	existing: readonly ExistingEntry[],
	currency: string,
): Set<number> => {
	const already = new Set(
		existing.map(
			(e) => `${e.occurred_on}/${parseMoney(e.amount, currency).toString()}`,
		),
	);
	return new Set(
		rows
			.filter((row) =>
				already.has(`${row.occurredOn}/${row.amount.toString()}`),
			)
			.map((row) => row.line),
	);
};

/** A mapping fitted to a file `width` columns wide: an optional column past its edge is dropped, a required one moved
 * to the first column, so a saved mapping never points nowhere. */
export const fitMapping = (
	mapping: ImportMapping,
	width: number,
): ImportMapping => {
	const fits = (column: number) => column < width;
	const required = (column: number) => (fits(column) ? column : 0);
	const optional = (column: number | null) =>
		column !== null && fits(column) ? column : null;
	return {
		...mapping,
		dateColumn: required(mapping.dateColumn),
		descriptionColumn: optional(mapping.descriptionColumn),
		categoryColumn: optional(mapping.categoryColumn),
		amount:
			mapping.amount.kind === "single"
				? { ...mapping.amount, column: required(mapping.amount.column) }
				: {
						kind: "split",
						debitColumn: required(mapping.amount.debitColumn),
						creditColumn: required(mapping.amount.creditColumn),
					},
	};
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
