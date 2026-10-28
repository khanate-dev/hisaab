// Spreadsheet export (spec §3.4; issue #10 resolution 10): a CSV of a household's Entries, for the date range and
// filters of search, with their Items, the recording member, and money exactly as stored (decimal text, never a float).
// Admins only. Written for spreadsheets, so a field a spreadsheet would run as a formula is defused.

import { isDecimalAmount } from "./money";

/**
 * One CSV field: a field a spreadsheet would run as a formula (one starting `=`, `+`, `-`, `@`, a tab or a carriage
 * return) gets a leading apostrophe, unless it's a plain number like `-450.50`; then it's quoted when it must be.
 */
export const csvCell = (value: string) => {
	const safe =
		/^[=+\-@\t\r]/.test(value) && !isDecimalAmount(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** Rows as CSV text, CRLF-separated as RFC 4180 has it. */
export const toCsv = (rows: readonly (readonly string[])[]) =>
	rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

/** An Entry as it's exported: what the app shows, in words, with its money as stored. */
export type ExportEntry = {
	id: string;
	occurredOn: string;
	occurredTime: string | null;
	kind: string;
	description: string | null;
	category: string | null;
	wallet: string;
	currency: string;
	/** Signed exact decimal text: what it changed the Wallet's Balance by. */
	amount: string;
	toWallet: string | null;
	/** What a Transfer brought into its other Wallet, exact. */
	received: string | null;
	notes: string | null;
	recordedBy: string | null;
	/** A Loan principal's or Repayment's Contact. */
	contact: string | null;
	items: readonly {
		description: string;
		category: string | null;
		amount: string;
		quantity: string | null;
	}[];
};

export const EXPORT_HEADER = [
	"Entry",
	"Date",
	"Time",
	"Kind",
	"Description",
	"Category",
	"Wallet",
	"Currency",
	"Amount",
	"To Wallet",
	"Received",
	"Contact",
	"Notes",
	"Recorded by",
	"Item",
	"Item Category",
	"Item Amount",
	"Quantity",
] as const;

/** The export's rows: a header, then each Entry, each Item on its own row under its Entry. */
export const exportRows = (entries: readonly ExportEntry[]): string[][] => [
	[...EXPORT_HEADER],
	...entries.flatMap((e) => {
		const entry = [
			e.id,
			e.occurredOn,
			e.occurredTime ?? "",
			e.kind,
			e.description ?? "",
			e.category ?? "",
			e.wallet,
			e.currency,
			e.amount,
			e.toWallet ?? "",
			e.received ?? "",
			e.contact ?? "",
			e.notes ?? "",
			e.recordedBy ?? "",
		];
		return [
			[...entry, "", "", "", ""],
			// An Item's row names its Entry, date and Wallet, and leaves the Entry's own columns empty.
			...e.items.map((item) => [
				e.id,
				e.occurredOn,
				...Array<string>(4).fill(""),
				e.wallet,
				e.currency,
				...Array<string>(6).fill(""),
				item.description,
				item.category ?? "",
				item.amount,
				item.quantity ?? "",
			]),
		];
	}),
];
