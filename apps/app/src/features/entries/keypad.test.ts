import { describe, expect, it } from "@jest/globals";

import { type KeypadKey, pressKey } from "./keypad";

const type = (keys: string, decimals = 2) =>
	[...keys].reduce(
		(amount, key) =>
			pressKey(amount, (key === "<" ? "delete" : key) as KeypadKey, decimals),
		"",
	);

describe("the quick-add keypad", () => {
	it.each([
		["1500", "1500"],
		["1500.50", "1500.50"],
		["0005", "5"],
		[".5", "0.5"],
		["1.2.3", "1.23"],
		["1.239", "1.23"],
		["12<", "1"],
		["<", ""],
		["1.<", "1"],
	])("types %j as %j", (keys, amount) => {
		expect(type(keys)).toBe(amount);
	});

	it("takes no decimals for a currency without them", () => {
		expect(type("12.5", 0)).toBe("125");
	});

	it("takes up to three decimals where the currency has them", () => {
		expect(type("1.2345", 3)).toBe("1.234");
	});

	it("stops at fifteen characters", () => {
		expect(type("12345678901234567890")).toHaveLength(15);
	});
});
