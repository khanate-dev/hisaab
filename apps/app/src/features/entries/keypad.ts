/** What the quick-add keypad sends: a digit, the decimal point, or delete-last. */
export type KeypadKey =
	"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "delete";

/** The key that deletes the last character typed. */
export const DELETE_KEY: KeypadKey = "delete";

/** Plenty for any household's amounts, and keeps the figure on one line. */
const MAX_LENGTH = 15;

/**
 * The amount as typed after one key: never a leading zero before a digit, one decimal point, and no more decimals
 * than the currency has (none for JPY).
 */
export const pressKey = (amount: string, key: KeypadKey, decimals: number) => {
	if (key === DELETE_KEY) return amount.slice(0, -1);
	const [, fraction] = amount.split(".");
	if (key === ".") {
		if (decimals === 0 || fraction !== undefined) return amount;
		return amount === "" ? "0." : `${amount}.`;
	}
	if (amount.length >= MAX_LENGTH) return amount;
	if (fraction !== undefined && fraction.length >= decimals) return amount;
	return amount === "0" ? key : amount + key;
};
