import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	addMoney,
	currencyDecimals,
	isNegative,
	isZero,
	Money,
	moneyEquals,
	negateMoney,
	parseMoney,
	sumMoney,
} from "./money";

// Exact decimals in the actual unit (ADR-0002): up to 4 decimal places, large enough for any household.
const decimalText = fc
	.tuple(
		fc.bigInt({ min: -(10n ** 16n), max: 10n ** 16n }),
		fc.integer({ min: 0, max: 4 }),
	)
	.map(([units, scale]) => {
		const negative = units < 0n;
		const digits = (negative ? -units : units)
			.toString()
			.padStart(scale + 1, "0");
		const text =
			scale === 0
				? digits
				: `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
		return negative ? `-${text}` : text;
	});
const currency = fc.constantFrom("PKR", "USD", "AED", "GBP");
const money = (code: string) =>
	decimalText.map((text) => parseMoney(text, code));

describe("Money", () => {
	it("adds exactly, where floats would drift", () => {
		expect(
			addMoney(parseMoney("0.1", "PKR"), parseMoney("0.2", "PKR")).toString(),
		).toBe("0.3");
		expect(
			sumMoney(
				[parseMoney("12345678901234.5678", "PKR"), parseMoney("0.0001", "PKR")],
				"PKR",
			).toString(),
		).toBe("12345678901234.5679");
	});

	it("round-trips through its text form", () => {
		fc.assert(
			fc.property(decimalText, currency, (text, code) => {
				const parsed = parseMoney(text, code);
				expect(moneyEquals(parseMoney(parsed.toString(), code), parsed)).toBe(
					true,
				);
			}),
		);
	});

	it("adds commutatively and associatively", () => {
		fc.assert(
			fc.property(
				currency.chain((code) =>
					fc.tuple(money(code), money(code), money(code)),
				),
				([a, b, c]) => {
					expect(moneyEquals(addMoney(a, b), addMoney(b, a))).toBe(true);
					expect(
						moneyEquals(
							addMoney(addMoney(a, b), c),
							addMoney(a, addMoney(b, c)),
						),
					).toBe(true);
				},
			),
		);
	});

	it("has zero as identity and negation as inverse", () => {
		fc.assert(
			fc.property(currency.chain(money), (a) => {
				const zero = parseMoney("0", a.currency);
				expect(moneyEquals(addMoney(a, zero), a)).toBe(true);
				expect(isZero(addMoney(a, negateMoney(a)))).toBe(true);
			}),
		);
	});

	it("sums in any order to the same total", () => {
		fc.assert(
			fc.property(
				currency
					.chain((code) =>
						fc.tuple(
							fc.constant(code),
							fc.array(money(code), { maxLength: 30 }),
						),
					)
					.chain(([code, amounts]) =>
						fc.tuple(
							fc.constant(code),
							fc.constant(amounts),
							fc.shuffledSubarray(amounts, {
								minLength: amounts.length,
								maxLength: amounts.length,
							}),
						),
					),
				([code, amounts, shuffled]) => {
					expect(
						moneyEquals(sumMoney(shuffled, code), sumMoney(amounts, code)),
					).toBe(true);
				},
			),
		);
	});

	it("treats negative zero as zero: not negative, printed as 0", () => {
		const negativeZero = parseMoney("-0.00", "PKR");
		expect(isZero(negativeZero)).toBe(true);
		expect(isNegative(negativeZero)).toBe(false);
		expect(negativeZero.toString()).toBe("0");
	});

	it("is negative exactly when below zero", () => {
		fc.assert(
			fc.property(decimalText, (text) => {
				expect(isNegative(parseMoney(text, "PKR"))).toBe(
					text.startsWith("-") && /[1-9]/.test(text),
				);
			}),
		);
	});

	it("refuses to mix currencies", () => {
		expect(() =>
			addMoney(parseMoney("1", "PKR"), parseMoney("1", "USD")),
		).toThrow(/currency/i);
	});

	it.each(["", "abc", "1e5", "1.2.3", "Infinity", "NaN", " 1", "1,000"])(
		"refuses to parse %j",
		(text) => {
			expect(() => parseMoney(text, "PKR")).toThrow();
		},
	);

	it.each(["usd", "US", "USDX", ""])(
		"refuses a currency code that isn't ISO 4217 shaped: %j",
		(code) => {
			expect(() => parseMoney("1", code)).toThrow(/currency/i);
		},
	);

	it("never becomes a float", () => {
		expect(Money).toBeDefined();
		expect(typeof parseMoney("1.5", "PKR").toString()).toBe("string");
	});
});

describe("currencyDecimals", () => {
	it.each([
		["PKR", 2],
		["USD", 2],
		["JPY", 0],
		["KWD", 3],
	])("%s has %i", (currency, decimals) => {
		expect(currencyDecimals(currency)).toBe(decimals);
	});

	it("is 2 for any currency ISO 4217 doesn't list otherwise", () => {
		const listed = [
			"BIF",
			"CLP",
			"DJF",
			"GNF",
			"ISK",
			"JPY",
			"KMF",
			"KRW",
			"PYG",
			"RWF",
			"UGX",
			"UYI",
			"VND",
			"VUV",
			"XAF",
			"XOF",
			"XPF",
			"BHD",
			"IQD",
			"JOD",
			"KWD",
			"LYD",
			"OMR",
			"TND",
		];
		fc.assert(
			fc.property(
				fc
					.stringMatching(/^[A-Z]{3}$/)
					.filter((code) => !listed.includes(code)),
				(code) => {
					expect(currencyDecimals(code)).toBe(2);
				},
			),
		);
	});
});
