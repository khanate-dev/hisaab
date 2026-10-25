import type { Money } from "@hisaab/domain";

/**
 * Money for display, in its currency and the device's locale. Intl formats the decimal text directly, so the amount
 * never passes through a float, and it shows at least as many decimals as the amount has: Intl's display default
 * for some currencies (PKR shows none) would otherwise round paisa away.
 */
export const formatMoney = (money: Money) => {
	const text = money.toString();
	const decimals = text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
	const usual = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: money.currency,
	}).resolvedOptions().maximumFractionDigits;
	const digits = Math.max(usual ?? 0, decimals);
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: money.currency,
		minimumFractionDigits: decimals > 0 ? digits : (usual ?? 0),
		maximumFractionDigits: digits,
	}).format(text as `${number}`);
};
