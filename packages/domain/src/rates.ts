import DecimalBase from "decimal.js";

// Cross rates on the device (spec §3.4; #44): rates sync per USD, as Open Exchange Rates gives them, so converting
// between two other currencies divides one by the other. Exact decimals throughout; a rate never becomes a JS number.

const Decimal = DecimalBase.clone({
	precision: 40,
	rounding: DecimalBase.ROUND_HALF_EVEN,
	toExpNeg: -40,
	toExpPos: 40,
});

/** Significant digits a cross rate keeps: far more than any Base amount needs. */
export const CROSS_RATE_DIGITS = 20;

/**
 * How many of `to` one `from` buys: USD→`to` ÷ USD→`from`, from each currency's rate per USD (decimal text). Rounded
 * to {@link CROSS_RATE_DIGITS} significant digits, with no trailing zeros.
 */
export const crossRate = (perUsdOfTo: string, perUsdOfFrom: string) => {
	const to = new Decimal(perUsdOfTo);
	const from = new Decimal(perUsdOfFrom);
	if (!(to.isFinite() && from.isFinite() && to.gt(0) && from.gt(0)))
		throw new Error(
			`Rates must be positive decimals: ${perUsdOfTo}, ${perUsdOfFrom}`,
		);
	return to.dividedBy(from).toSignificantDigits(CROSS_RATE_DIGITS).toFixed();
};
