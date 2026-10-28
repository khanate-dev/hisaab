import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	csvCell,
	EXPORT_HEADER,
	type ExportEntry,
	exportRows,
	toCsv,
} from "./csv-export";
import { parseCsv } from "./csv-import";

describe("csvCell", () => {
	it("defuses what a spreadsheet would run as a formula, but never a plain amount", () => {
		expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
		expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
		expect(csvCell("-450.50")).toBe("-450.50");
		expect(csvCell("+92 300")).toBe("'+92 300");
	});
});

describe("toCsv", () => {
	it("reads back exactly as written when nothing needs defusing", () => {
		const safe = fc
			.string({ maxLength: 10 })
			.filter((v) => !/^[=+\-@\t\r]/.test(v));
		fc.assert(
			fc.property(
				fc.array(fc.array(safe, { minLength: 2, maxLength: 5 }), {
					minLength: 1,
					maxLength: 6,
				}),
				(rows) => {
					expect(parseCsv(toCsv(rows)).records.map((r) => r.cells)).toEqual(
						rows,
					);
				},
			),
		);
	});

	it("reads a defused field back with its apostrophe, and an amount as itself", () => {
		const back = parseCsv(toCsv([["=1+1", "-450.50", "@x", "+92"]])).records[0]
			?.cells;
		expect(back).toEqual(["'=1+1", "-450.50", "'@x", "'+92"]);
	});
});

describe("exportRows", () => {
	const entry = (
		id: string,
		items: ExportEntry["items"] = [],
	): ExportEntry => ({
		id,
		occurredOn: "2026-10-28",
		occurredTime: null,
		kind: "Expense",
		description: "Weekly shop",
		category: "Groceries",
		wallet: "Cash",
		currency: "PKR",
		amount: "-12345678901234.5678",
		toWallet: null,
		received: null,
		notes: null,
		recordedBy: "Ayesha",
		contact: null,
		items,
	});

	it("is a header, then each Entry with its Items under it, money exactly as stored", () => {
		const rows = exportRows([
			entry("e1", [
				{
					description: "Milk",
					category: "Dairy",
					amount: "450.10",
					quantity: "2",
				},
			]),
			entry("e2"),
		]);
		expect(rows[0]).toEqual([...EXPORT_HEADER]);
		expect(rows).toHaveLength(4);
		expect(rows[1]?.[8]).toBe("-12345678901234.5678");
		expect(rows[2]?.slice(-4)).toEqual(["Milk", "Dairy", "450.10", "2"]);
		expect(rows[2]?.[0]).toBe("e1");
		expect(rows.every((r) => r.length === EXPORT_HEADER.length)).toBe(true);
	});
});
