import DecimalBase from "decimal.js";

// ADR-0002: money is an exact decimal in the actual unit (not minor units, never a float), with an ISO 4217 currency.
// It travels as text (Postgres numeric, SQLite TEXT) and is parsed here; arithmetic never touches a JS number.

/** Generous precision so no realistic sum ever rounds; amounts are exact as long as they fit. */
const Decimal = DecimalBase.clone({
	precision: 60,
	rounding: DecimalBase.ROUND_HALF_EVEN,
	toExpNeg: -60,
	toExpPos: 60,
});
type Decimal = InstanceType<typeof Decimal>;

/** A plain decimal: optional minus, digits, optional fraction. No exponents, separators or spaces. */
const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

export class Money {
	private constructor(
		private readonly amount: Decimal,
		readonly currency: string,
	) {}

	/** @internal */
	static of(amount: Decimal, currency: string) {
		if (!CURRENCY_CODE.test(currency))
			throw new Error(
				`Not an ISO 4217 currency code: ${JSON.stringify(currency)}`,
			);
		return new Money(amount, currency);
	}

	/** The canonical text form: what Postgres and the local database store. */
	toString() {
		return this.amount.toFixed();
	}

	/** @internal */
	get decimal() {
		return this.amount;
	}
}

/** Whether the text is an amount parseMoney accepts. */
export const isDecimalAmount = (text: string) => DECIMAL_TEXT.test(text);

export const parseMoney = (text: string, currency: string): Money => {
	if (!DECIMAL_TEXT.test(text))
		throw new Error(`Not a decimal amount: ${JSON.stringify(text)}`);
	return Money.of(new Decimal(text), currency);
};

const sameCurrency = (a: Money, b: Money) => {
	if (a.currency !== b.currency)
		throw new Error(
			`Can't combine ${a.currency} and ${b.currency}: convert the currency first`,
		);
};

export const addMoney = (a: Money, b: Money): Money => {
	sameCurrency(a, b);
	return Money.of(a.decimal.plus(b.decimal), a.currency);
};

export const negateMoney = (a: Money): Money =>
	Money.of(a.decimal.negated(), a.currency);

/** The total of the amounts, which must all be in `currency`; an empty list totals zero. */
export const sumMoney = (amounts: readonly Money[], currency: string): Money =>
	amounts.reduce(addMoney, Money.of(new Decimal(0), currency));

export const isZero = (a: Money) => a.decimal.isZero();
export const isNegative = (a: Money) =>
	a.decimal.isNegative() && !a.decimal.isZero();

export const moneyEquals = (a: Money, b: Money) =>
	a.currency === b.currency && a.decimal.equals(b.decimal);
