import { getLocales } from "expo-localization";

/** An ISO 4217 code the platform knows, where it can say; otherwise any three capital letters. */
export const isCurrencyCode = (code: string) => {
	if (!/^[A-Z]{3}$/.test(code)) return false;
	const known =
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("currency")
			: null;
	return known === null || known.includes(code);
};

/** The device locale's currency: the First Wallet's default. */
export const deviceCurrency = () => getLocales()[0]?.currencyCode ?? "USD";
