import { isNegative, type Money, negateMoney } from "./money";
import { newestFirst, type Dated } from "./entry-order";

/** The kinds a person records with the Entry form; their amounts are signed by kind. */
export const FLOW_KINDS = ["expense", "income"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** Whether an Entry kind (or any text, say a route parameter) is one the Entry form records. */
export const isFlowKind = (kind: string | undefined): kind is FlowKind =>
	FLOW_KINDS.some((flow) => flow === kind);

/** How much, whichever way it went: what the Entry form shows and takes. */
export const magnitude = (amount: Money) =>
	isNegative(amount) ? negateMoney(amount) : amount;

/**
 * A cross-household transfer's two halves (ADR-0003): the same money leaving the From Wallet in one household and
 * arriving in the To Wallet in the other, each signed by its effect on its Wallet.
 */
export const householdTransferHalves = (amount: Money) => ({
	leaves: negateMoney(magnitude(amount)),
	arrives: magnitude(amount),
});

/** An Entry's amount is its signed effect on the Balance: an Expense takes money out, an Income brings it in. */
export const signedAmount = (kind: FlowKind, amount: Money) =>
	kind === "expense" ? negateMoney(magnitude(amount)) : magnitude(amount);

type Describable = Dated & { kind: string; description: string | null };

const key = (description: string) => description.trim().toLowerCase();

/**
 * Past Entries whose description matches what's being typed, newest first and one per description, so picking one
 * can pre-fill its Category, Wallet and amount (spec §3.3).
 */
export const descriptionSuggestions = <T extends Describable>(
	entries: readonly T[],
	query: string,
	kind: FlowKind,
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

/**
 * Recent chips (spec §4.2): the most frequent descriptions among the kind's `window` latest Entries, most frequent
 * first (ties to the most recent), each as its latest Entry, so tapping one repeats it.
 */
export const recentDescriptions = <T extends Describable>(
	entries: readonly T[],
	kind: FlowKind,
	{ window = 50, limit = 5 } = {},
): T[] => {
	const recent = entries
		.filter(
			(e) =>
				e.kind === kind && e.description !== null && key(e.description) !== "",
		)
		.toSorted(newestFirst)
		.slice(0, window);
	const byDescription = new Map<
		string,
		{ latest: T; count: number; rank: number }
	>();
	recent.forEach((entry, rank) => {
		const described = key(entry.description ?? "");
		const seen = byDescription.get(described);
		if (seen) seen.count += 1;
		else byDescription.set(described, { latest: entry, count: 1, rank });
	});
	return [...byDescription.values()]
		.toSorted((a, b) => b.count - a.count || a.rank - b.rank)
		.slice(0, limit)
		.map(({ latest }) => latest);
};

type Categorized = Dated & { kind: string; category_id: string | null };

/**
 * The Categories quick-add shows first: those the kind's `window` latest Entries used most, most used first (ties to
 * the most recent), up to `limit`.
 */
export const frequentCategories = (
	entries: readonly Categorized[],
	kind: FlowKind,
	{ window = 50, limit = 8 } = {},
): string[] => {
	const uses = new Map<string, { count: number; rank: number }>();
	entries
		.filter((e) => e.kind === kind && e.category_id !== null)
		.toSorted(newestFirst)
		.slice(0, window)
		.forEach((entry, rank) => {
			const id = entry.category_id ?? "";
			const seen = uses.get(id);
			if (seen) seen.count += 1;
			else uses.set(id, { count: 1, rank });
		});
	return [...uses]
		.toSorted(([, a], [, b]) => b.count - a.count || a.rank - b.rank)
		.slice(0, limit)
		.map(([id]) => id);
};
