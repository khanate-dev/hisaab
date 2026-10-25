import { isCurrencyCode as hasCurrencyShape } from "@hisaab/domain";
import { getLocales } from "expo-localization";

/** An ISO 4217 code the platform knows, where it can say; otherwise any three capital letters. */
export const isCurrencyCode = (code: string) => {
	if (!hasCurrencyShape(code)) return false;
	const known =
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("currency")
			: null;
	return known === null || known.includes(code);
};

/** What a person typed as a currency, as its code; null when it isn't one. */
export const toCurrencyCode = (input: string) => {
	const code = input.trim().toUpperCase();
	return isCurrencyCode(code) ? code : null;
};

/** The device locale's currency: the First Wallet's default. */
export const deviceCurrency = () => getLocales()[0]?.currencyCode ?? "USD";
