import { isNegative, type Money, negateMoney } from "./money";
import { newestFirst, type Occurrence } from "./entry-order";

/** The kinds a person records with the Entry form; their amounts are signed by kind. */
export const FLOW_KINDS = ["expense", "income"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** How much, whichever way it went: what the Entry form shows and takes. */
export const magnitude = (amount: Money) =>
	isNegative(amount) ? negateMoney(amount) : amount;

/** An Entry's amount is its signed effect on the Balance: an Expense takes money out, an Income brings it in. */
export const signedAmount = (kind: FlowKind, amount: Money) =>
	kind === "expense" ? negateMoney(magnitude(amount)) : magnitude(amount);

type Describable = Occurrence & { kind: string; description: string | null };

const key = (description: string) => description.trim().toLowerCase();

/**
 * Past Entries whose description matches what's being typed, newest first and one per description, so picking one
 * can pre-fill its Category, Wallet and amount (spec §3.3).
 */
export const descriptionSuggestions = <T extends Describable>(
	entries: readonly T[],
	query: string,
	kind: string,
	limit = 5,
): T[] => {
	const typed = key(query);
	if (typed === "") return [];
	const seen = new Set<string>();
	const suggestions: T[] = [];
	for (const entry of entries.toSorted(newestFirst)) {
		if (entry.kind !== kind || entry.description === null) continue;
		const described = key(entry.description);
		if (described === "" || !described.includes(typed) || seen.has(described))
			continue;
		seen.add(described);
		suggestions.push(entry);
		if (suggestions.length === limit) break;
	}
	return suggestions;
};
