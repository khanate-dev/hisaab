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

/** A calendar date (YYYY-MM-DD) for display in the device's locale, without shifting it across timezones. */
export const formatDate = (isoDate: string) => {
	const [year, month, day] = isoDate.split("-").map(Number);
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
		new Date(year ?? 0, (month ?? 1) - 1, day ?? 1),
	);
};

/** A Budget month for display, named after the month it starts in ("October 2026"), from its first date. */
export const formatBudgetMonth = (firstDate: string) => {
	const [year, month] = firstDate.split("-").map(Number);
	return new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric",
	}).format(new Date(year ?? 0, (month ?? 1) - 1, 1));
};

/** An instant, say when a change reached the server, as a date and time in the device's locale and timezone. */
export const formatDateTime = (iso: string) =>
	new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(iso));
