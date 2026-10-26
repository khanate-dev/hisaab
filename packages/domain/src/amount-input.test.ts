import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	type AmountKey,
	DELETE_KEY,
	MAX_AMOUNT_LENGTH,
	typeAmountKey,
} from "./amount-input";
import { isDecimalAmount } from "./money";

const key = fc.constantFrom<AmountKey>(
	"0",
	"1",
	"2",
	"5",
	"9",
	".",
	DELETE_KEY,
);
const decimals = fc.constantFrom(0, 2, 3);
const typed = (keys: readonly AmountKey[], places: number) =>
	keys.reduce((amount, k) => typeAmountKey(amount, k, places), "");

describe("typeAmountKey", () => {
	it("always leaves an amount the keypad can show and Money can parse", () => {
		fc.assert(
			fc.property(
				fc.array(key, { maxLength: 40 }),
				decimals,
				(keys, places) => {
					const amount = typed(keys, places);
					expect(amount.length).toBeLessThanOrEqual(MAX_AMOUNT_LENGTH + 1);
					// Empty, a decimal amount, or one with its point just typed ("12.").
					expect(
						amount === "" ||
							isDecimalAmount(amount) ||
							isDecimalAmount(amount.slice(0, -1)),
					).toBe(true);
					const [whole = "", fraction] = amount.split(".");
					expect(fraction?.length ?? 0).toBeLessThanOrEqual(places);
					if (places === 0) expect(fraction).toBeUndefined();
					expect(whole === "0" || !whole.startsWith("0")).toBe(true);
				},
			),
		);
	});

	it("deletes exactly the last character", () => {
		fc.assert(
			fc.property(
				fc.array(key, { maxLength: 30 }),
				decimals,
				(keys, places) => {
					const amount = typed(keys, places);
					expect(typeAmountKey(amount, DELETE_KEY, places)).toBe(
						amount.slice(0, -1),
					);
				},
			),
		);
	});

	it.each([
		["1500", "1500"],
		["1500.50", "1500.50"],
		["0005", "5"],
		[".5", "0.5"],
		["1.2.3", "1.23"],
		["1.239", "1.23"],
	])("types %j as %j", (keys, amount) => {
		expect(typed([...keys] as AmountKey[], 2)).toBe(amount);
	});
});
