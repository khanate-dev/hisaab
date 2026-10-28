import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	fitMapping,
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

/** One CSV field as RFC 4180 writes it: quoted when it has to be. */
const csvField = (value: string) =>
	/[",\r\n]/.test(value) || value.startsWith('"')
		? `"${value.replaceAll('"', '""')}"`
		: value;
const cells = (text: string) => parseCsv(text).records.map((r) => r.cells);

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
					// A row of one empty field is a blank line, which isn't a record.
					expect(cells(text)).toEqual(
						rows.filter((r) => !(r.length === 1 && r[0] === "")),
					);
				},
			),
		);
	});

	it("drops a byte-order mark and blank lines, and knows each record's line", () => {
		expect(
			parseCsv('\uFEFFDate,Amount\n\n2026-10-01,"two\nlines"\n2026-10-02,5\n'),
		).toEqual({
			records: [
				{ line: 1, cells: ["Date", "Amount"] },
				{ line: 3, cells: ["2026-10-01", "two\nlines"] },
				{ line: 5, cells: ["2026-10-02", "5"] },
			],
			unclosedAt: null,
		});
	});

	it("reads nothing past a quote that never closes, and says where it opened", () => {
		expect(parseCsv('a,b\nc,"oops\nd,e')).toEqual({
			records: [{ line: 1, cells: ["a", "b"] }],
			unclosedAt: 2,
		});
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
	it("reads statement amounts exactly in their usual dressing", () => {
		const read = (text: string) => readAmount(text, "PKR")?.toString() ?? null;
		expect(read("1,234.50")).toBe("1234.5");
		expect(read("Rs. 2,500")).toBe("2500");
		expect(read("PKR 1,000.00")).toBe("1000");
		expect(read("(1,200.00)")).toBe("-1200");
		expect(read("450-")).toBe("-450");
		expect(read("500 DR")).toBe("-500");
		expect(read("500 CR")).toBe("500");
		expect(read("-0.10")).toBe("-0.1");
	});

	it("refuses what it would have to guess at, rather than import the wrong money", () => {
		const read = (text: string, currency = "PKR") =>
			readAmount(text, currency)?.toString() ?? null;
		for (const text of [
			"",
			"n/a",
			"1.234,50",
			"12,50",
			"1,2",
			"1.5e3",
			"--5",
			"(5",
			"-(5)",
			"-5-",
			"5 DRX",
			"100.555",
		])
			expect(read(text)).toBeNull();
		expect(read("100.5", "JPY")).toBeNull();
	});

	it("keeps an amount's size and direction however it's dressed", () => {
		fc.assert(
			fc.property(
				fc.bigInt({ min: 0n, max: 10n ** 12n }),
				fc.integer({ min: 0, max: 99 }),
				fc.boolean(),
				fc.constantFrom("", "Rs ", "PKR ", "₨"),
				fc.constantFrom("minus", "parentheses", "trailing", "dr"),
				fc.boolean(),
				(whole, cents, out, prefix, outMark, grouped) => {
					const digits = grouped
						? whole.toLocaleString("en-US")
						: whole.toString();
					const fraction = String(cents).padStart(2, "0");
					const plain = `${digits}.${fraction}`;
					const dressed = !out
						? `${prefix}${plain}`
						: outMark === "minus"
							? `${prefix}-${plain}`
							: outMark === "parentheses"
								? `(${prefix}${plain})`
								: outMark === "trailing"
									? `${prefix}${plain}-`
									: `${prefix}${plain} DR`;
					const want = parseMoney(
						`${out ? "-" : ""}${whole}.${fraction}`,
						"PKR",
					);
					expect(readAmount(dressed, "PKR")?.toString()).toBe(want.toString());
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
		).records;
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
		const csv = parseCsv(
			"2026-10-01,Milk,450,\n2026-10-02,Salary,,90000\n2026-10-03,Both,5,6",
		).records;
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
		const { problems } = readRows(
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
		// Both a debit and a credit: which is meant can't be told.
		expect(problems).toEqual([{ line: 3, reason: "both" }]);
	});

	it("flips a statement that shows money out as positive", () => {
		const csv = parseCsv("2026-10-01,Milk,450").records;
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

	it("flags rows with the date and amount of an Entry already in the Wallet, the same way round", () => {
		const flagged = likelyDuplicates(
			[
				row(2, "2026-10-01", "-450"),
				row(3, "2026-10-01", "-450.00"),
				row(4, "2026-10-01", "450"),
				row(5, "2026-10-02", "-450"),
			],
			[{ occurred_on: "2026-10-01", amount: "-450" }],
			"PKR",
		);
		expect([...flagged]).toEqual([2, 3]);
	});

	it("flags exactly the rows matching an Entry already there, never two real charges in one file", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 1, max: 20 }), { maxLength: 20 }),
				fc.array(fc.integer({ min: 1, max: 20 }), { maxLength: 5 }),
				(amounts, existing) => {
					const rows = amounts.map((a, i) =>
						row(i + 1, "2026-10-01", String(a)),
					);
					const flagged = likelyDuplicates(
						rows,
						existing.map((a) => ({
							occurred_on: "2026-10-01",
							amount: String(a),
						})),
						"PKR",
					);
					expect([...flagged]).toEqual(
						rows
							.filter((_, i) => existing.includes(amounts[i] ?? 0))
							.map((r) => r.line),
					);
				},
			),
		);
	});
});

describe("fitMapping", () => {
	it("never points a mapping past the file's columns", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 6 }),
				fc.integer({ min: 0, max: 9 }),
				(width, column) => {
					const fitted = fitMapping(
						{
							...single,
							dateColumn: column,
							descriptionColumn: column,
							amount: {
								kind: "split",
								debitColumn: column,
								creditColumn: column,
							},
							categoryColumn: column,
						},
						width,
					);
					const used = [
						fitted.dateColumn,
						fitted.descriptionColumn,
						fitted.categoryColumn,
					];
					if (fitted.amount.kind === "split")
						used.push(fitted.amount.debitColumn, fitted.amount.creditColumn);
					expect(used.every((c) => c === null || c < width)).toBe(true);
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
