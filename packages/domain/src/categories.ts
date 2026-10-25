// A household's Categories (spec §3.3): separate Expense and Income lists, one level of Subcategories. Archived
// Categories leave the lists but are kept, as Entries may still point at them.

export type CategoryLike = {
	id: string;
	kind: "expense" | "income";
	parent_id: string | null;
	name: string;
	archived_at: string | null;
};

export type CategoryNode<T extends CategoryLike> = {
	category: T;
	subcategories: T[];
};

const byName = (a: CategoryLike, b: CategoryLike) =>
	a.name.localeCompare(b.name);

const isActive = (category: CategoryLike) => category.archived_at === null;

/** One list's active Categories, by name, each with its active Subcategories, by name. */
export const categoryTree = <T extends CategoryLike>(
	categories: readonly T[],
	kind: CategoryLike["kind"],
): CategoryNode<T>[] => {
	const inList = categories.filter((c) => c.kind === kind && isActive(c));
	return inList
		.filter((c) => c.parent_id === null)
		.toSorted(byName)
		.map((category) => ({
			category,
			subcategories: inList
				.filter((c) => c.parent_id === category.id)
				.toSorted(byName),
		}));
};

/** One list's archived Categories, by name, each with its parent when it's a Subcategory. */
export const archivedCategories = <T extends CategoryLike>(
	categories: readonly T[],
	kind: CategoryLike["kind"],
): { category: T; parent: T | null }[] => {
	const index = new Map(categories.map((c) => [c.id, c]));
	return categories
		.filter((c) => c.kind === kind && !isActive(c))
		.toSorted(byName)
		.map((category) => ({
			category,
			parent:
				category.parent_id === null
					? null
					: (index.get(category.parent_id) ?? null),
		}));
};

/**
 * Where a Category may sit as a Subcategory: under an active top-level Category of its own list, never itself. A
 * Category that has Subcategories stays top-level, as Subcategories are one level deep.
 */
export const parentChoices = <T extends CategoryLike>(
	categories: readonly T[],
	kind: CategoryLike["kind"],
	categoryId: string | null,
): T[] => {
	if (categoryId !== null && categories.some((c) => c.parent_id === categoryId))
		return [];
	return categories
		.filter(
			(c) =>
				c.kind === kind &&
				c.parent_id === null &&
				isActive(c) &&
				c.id !== categoryId,
		)
		.toSorted(byName);
};
