import { categoryTree, type ImportRow, isNegative } from "@hisaab/domain";

import type { Category } from "@/features/categories/types";

const EXPENSE: Category["kind"] = "expense";
const INCOME: Category["kind"] = "income";

/** Money out becomes an Expense, money in an Income. */
export const kindOf = (row: ImportRow): Category["kind"] =>
	isNegative(row.amount) ? EXPENSE : INCOME;

/** The row's category column matched to an active Category of the right list by name, ignoring case; else none. */
export const guessCategory = (
	row: ImportRow,
	categories: readonly Category[],
) => {
	const name = row.categoryName?.trim().toLowerCase();
	if (!name) return null;
	const kind = kindOf(row);
	return (
		categories.find(
			(c) =>
				c.kind === kind &&
				c.archived_at === null &&
				c.name.toLowerCase() === name,
		)?.id ?? null
	);
};

/** One list's active Categories as choices, Subcategories named under their parent. */
export const categoryChoices = (
	categories: readonly Category[],
	kind: Category["kind"],
	/** How a Subcategory reads under its parent ("Food: Groceries"), in the User's language. */
	underParent: (parent: string, name: string) => string,
) =>
	categoryTree(categories, kind).flatMap(({ category, subcategories }) => [
		{ value: category.id, label: category.name },
		...subcategories.map(({ id, name }) => ({
			value: id,
			label: underParent(category.name, name),
		})),
	]);
