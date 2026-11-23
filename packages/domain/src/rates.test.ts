import DecimalBase from "decimal.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CROSS_RATE_DIGITS, crossRate } from "./rates";

const perUsd = fc
	.tuple(fc.integer({ min: 1, max: 999_999 }), fc.integer({ min: 0, max: 6 }))
	.map(([digits, scale]) =>
		new DecimalBase(digits).dividedBy(10 ** scale).toFixed(),
	);

describe("crossRate", () => {
	it("divides USD→target by USD→source", () => {
		expect(crossRate("278.755", "1")).toBe("278.755");
		expect(crossRate("278.755", "0.92")).toBe("302.99456521739130435");
		expect(crossRate("1", "278.755")).toBe("0.0035873795985722229198");
	});

	it("is 1 for a currency to itself, and a round trip comes back to 1 within its precision", () => {
		fc.assert(
			fc.property(perUsd, perUsd, (a, b) => {
				expect(crossRate(a, a)).toBe("1");
				const there = new DecimalBase(crossRate(a, b));
				const back = new DecimalBase(crossRate(b, a));
				expect(
					there
						.times(back)
						.minus(1)
						.abs()
						.lte(new DecimalBase(10).pow(2 - CROSS_RATE_DIGITS)),
				).toBe(true);
			}),
		);
	});

	it("refuses rates that aren't positive", () => {
		expect(() => crossRate("0", "1")).toThrow();
		expect(() => crossRate("1", "-2")).toThrow();
	});
});
