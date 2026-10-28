import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	csvField,
	type ImportMapping,
	likelyDuplicates,
	parseCsv,
	readAmount,
	readDate,
	readMapping,
	readRows,
} from "./csv-import";
import { shiftCalendarDate } from "./dates";
import { parseMoney } from "./money";

const field = fc.string({ maxLength: 12 });

describe("parseCsv", () => {
	it("reads back what csvField writes, quotes, commas and line breaks included", () => {
		fc.assert(
			fc.property(
				fc.array(fc.array(field, { minLength: 2, maxLength: 5 }), {
					minLength: 1,
					maxLength: 6,
				}),
				fc.constantFrom("\n", "\r\n"),
				(rows, newline) => {
					const text = rows.map((r) => r.map(csvField).join(",")).join(newline);
					expect(parseCsv(text)).toEqual(rows);
				},
			),
		);
	});

	it("drops a byte-order mark and blank lines", () => {
		expect(parseCsv("﻿Date,Amount\n\n2026-10-01,5\n")).toEqual([
			["Date", "Amount"],
			["2026-10-01", "5"],
		]);
	});
});

describe("readDate", () => {
	it("reads each format back to the same calendar date", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 365 * 50 }), (days) => {
				const date = shiftCalendarDate("2000-01-01", days);
				const [y, m, d] = date.split("-") as [string, string, string];
				expect(readDate(date, "YYYY-MM-DD")).toBe(date);
				expect(readDate(`${d}/${m}/${y}`, "DD/MM/YYYY")).toBe(date);
				expect(readDate(`${Number(m)}/${Number(d)}/${y}`, "MM/DD/YYYY")).toBe(
					date,
				);
			}),
		);
	});

	it("refuses what isn't a real date", () => {
		expect(readDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
		expect(readDate("yesterday", "YYYY-MM-DD")).toBeNull();
	});
});

describe("readAmount", () => {
	it("reads statement amounts exactly, whatever their dressing", () => {
		const read = (text: string) => readAmount(text, "PKR")?.toString() ?? null;
		expect(read("1,234.50")).toBe("1234.5");
		expect(read("Rs 2,500")).toBe("2500");
		expect(read("(1,200.00)")).toBe("-1200");
		expect(read("450-")).toBe("-450");
		expect(read("-0.10")).toBe("-0.1");
		expect(read("")).toBeNull();
		expect(read("n/a")).toBeNull();
	});

	it("never loses a cent", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: -10_000_000, max: 10_000_000 }),
				(cents) => {
					const text = (cents / 100).toFixed(2);
					expect(readAmount(text, "PKR")?.toString()).toBe(
						parseMoney(text, "PKR").toString(),
					);
				},
			),
		);
	});
});

const single: ImportMapping = {
	hasHeader: true,
	dateColumn: 0,
	dateFormat: "DD/MM/YYYY",
	descriptionColumn: 1,
	amount: { kind: "single", column: 2, outIsPositive: false },
	categoryColumn: 3,
};

describe("readRows", () => {
	it("reads data rows through a mapping, and points at the lines it can't read", () => {
		const csv = parseCsv(
			"Date,Details,Amount,Category\n01/10/2026,Milk,-450,Groceries\n02/10/2026,Salary,90000,\nlater,Oops,5,\n03/10/2026,Nothing,0,",
		);
		const { rows, problems } = readRows(csv, single, "PKR");
		expect(
			rows.map((r) => [
				r.line,
				r.occurredOn,
				r.description,
				r.amount.toString(),
				r.categoryName,
			]),
		).toEqual([
			[2, "2026-10-01", "Milk", "-450", "Groceries"],
			[3, "2026-10-02", "Salary", "90000", null],
		]);
		expect(problems).toEqual([
			{ line: 4, reason: "date" },
			{ line: 5, reason: "zero" },
		]);
	});

	it("takes money out from a debit column and money in from a credit one", () => {
		const csv = parseCsv("2026-10-01,Milk,450,\n2026-10-02,Salary,,90000");
		const { rows } = readRows(
			csv,
			{
				...single,
				hasHeader: false,
				dateFormat: "YYYY-MM-DD",
				amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
				categoryColumn: null,
			},
			"PKR",
		);
		expect(rows.map((r) => r.amount.toString())).toEqual(["-450", "90000"]);
	});

	it("flips a statement that shows money out as positive", () => {
		const csv = parseCsv("2026-10-01,Milk,450");
		const { rows } = readRows(
			csv,
			{
				...single,
				hasHeader: false,
				dateFormat: "YYYY-MM-DD",
				amount: { kind: "single", column: 2, outIsPositive: true },
				categoryColumn: null,
			},
			"PKR",
		);
		expect(rows[0]?.amount.toString()).toBe("-450");
	});
});

describe("likelyDuplicates", () => {
	const row = (line: number, occurredOn: string, amount: string) => ({
		line,
		occurredOn,
		description: null,
		amount: parseMoney(amount, "PKR"),
		categoryName: null,
	});

	it("flags rows with the date and amount of an Entry already there, or of an earlier row", () => {
		const flagged = likelyDuplicates(
			[
				row(2, "2026-10-01", "-450"),
				row(3, "2026-10-01", "-450.00"),
				row(4, "2026-10-02", "-450"),
				row(5, "2026-10-03", "100"),
			],
			[{ occurred_on: "2026-10-03", amount: "100" }],
			"PKR",
		);
		expect([...flagged]).toEqual([3, 5]);
	});

	it("flags nothing in a file of distinct rows with nothing already there", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), { maxLength: 20 }),
				(amounts) => {
					const rows = amounts.map((a, i) =>
						row(i + 1, "2026-10-01", String(a)),
					);
					expect(likelyDuplicates(rows, [], "PKR").size).toBe(0);
				},
			),
		);
	});
});

describe("readMapping", () => {
	it("round-trips a mapping and refuses a malformed one", () => {
		expect(readMapping(JSON.stringify(single))).toEqual(single);
		expect(readMapping("{}")).toBeNull();
		expect(readMapping("nope")).toBeNull();
		expect(readMapping(null)).toBeNull();
	});
});
