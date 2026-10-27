import DecimalBase from "decimal.js";

// ADR-0002: money is an exact decimal in the actual unit (not minor units, never a float), with an ISO 4217 currency.
// It travels as text (Postgres numeric, SQLite TEXT) and is parsed here; arithmetic never touches a JS number.

/** Exact up to 60 significant digits, far beyond any household amount; Postgres numeric holds whatever arrives. */
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

/** Whether the code has the shape of an ISO 4217 currency code. */
export const isCurrencyCode = (code: string) => CURRENCY_CODE.test(code);

/** Whether the text is an amount parseMoney accepts. */
export const isDecimalAmount = (text: string) => DECIMAL_TEXT.test(text);

/** An exact amount in one currency. The decimal library stays inside; nothing outside sees a number. */
export class Money {
	readonly #amount: Decimal;
	readonly currency: string;

	private constructor(amount: Decimal, currency: string) {
		if (!isCurrencyCode(currency))
			throw new Error(
				`Not an ISO 4217 currency code: ${JSON.stringify(currency)}`,
			);
		this.#amount = amount;
		this.currency = currency;
	}

	static parse(text: string, currency: string) {
		if (!isDecimalAmount(text))
			throw new Error(`Not a decimal amount: ${JSON.stringify(text)}`);
		return new Money(new Decimal(text), currency);
	}

	static zero(currency: string) {
		return new Money(new Decimal(0), currency);
	}

	plus(other: Money) {
		if (other.currency !== this.currency) {
			throw new Error(
				`Can't combine ${this.currency} and ${other.currency}: convert the currency first`,
			);
		}
		return new Money(this.#amount.plus(other.#amount), this.currency);
	}

	negated() {
		return new Money(this.#amount.negated(), this.currency);
	}

	isZero() {
		return this.#amount.isZero();
	}

	/** Strictly below zero; negative zero is zero. */
	isNegative() {
		return this.#amount.isNegative() && !this.#amount.isZero();
	}

	equals(other: Money) {
		return (
			this.currency === other.currency && this.#amount.equals(other.#amount)
		);
	}

	/** This many times over, exactly; `factor` is a whole number. */
	times(factor: number) {
		if (!Number.isInteger(factor))
			throw new Error(`Not a whole number: ${factor}`);
		return new Money(this.#amount.times(factor), this.currency);
	}

	/** How much of `whole` this is, as a whole percentage (rounded half up): for showing Pace, never for sums. */
	percentOf(whole: Money) {
		if (whole.currency !== this.currency) {
			throw new Error(
				`Can't compare ${this.currency} and ${whole.currency}: convert the currency first`,
			);
		}
		if (whole.#amount.isZero()) return null;
		return this.#amount
			.times(100)
			.dividedBy(whole.#amount)
			.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
			.toNumber();
	}

	/** The canonical text form: what Postgres and the local database store. Negative zero prints as "0". */
	toString() {
		return this.#amount.isZero() ? "0" : this.#amount.toFixed();
	}
}

export const parseMoney = (text: string, currency: string) =>
	Money.parse(text, currency);
export const zeroMoney = (currency: string) => Money.zero(currency);
export const addMoney = (a: Money, b: Money) => a.plus(b);
export const negateMoney = (a: Money) => a.negated();
export const isZero = (a: Money) => a.isZero();
export const isNegative = (a: Money) => a.isNegative();
export const moneyEquals = (a: Money, b: Money) => a.equals(b);
/** `part` as a whole percentage of `whole`; null when `whole` is zero. */
export const timesMoney = (a: Money, factor: number) => a.times(factor);
export const percentOf = (part: Money, whole: Money) => part.percentOf(whole);

/** The total of the amounts, which must all be in `currency`; an empty list totals zero. */
export const sumMoney = (amounts: readonly Money[], currency: string): Money =>
	amounts.reduce(addMoney, zeroMoney(currency));

// ISO 4217 minor units, where they aren't 2. (Intl reports the Unicode locale data's cash rounding instead: 0 for PKR.)
const NO_DECIMALS = new Set([
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
]);
const THREE_DECIMALS = new Set([
	"BHD",
	"IQD",
	"JOD",
	"KWD",
	"LYD",
	"OMR",
	"TND",
]);

/** How many decimals a currency's amounts have (ISO 4217): 2 for PKR and USD, 0 for JPY, 3 for KWD. */
export const currencyDecimals = (currency: string) =>
	NO_DECIMALS.has(currency) ? 0 : THREE_DECIMALS.has(currency) ? 3 : 2;
