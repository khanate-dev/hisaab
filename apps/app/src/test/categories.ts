import type { Category } from "@/features/categories/types";

/** A synced Category row for tests: an Expense Category unless told otherwise. */
export const makeCategory = (
	id: string,
	name: string,
	overrides: Partial<Category> = {},
): Category => ({
	id,
	household_id: "h1",
	kind: "expense",
	parent_id: null,
	name,
	icon: "groceries",
	color: "lime",
	archived_at: null,
	created_at: "2026-10-26T00:00:00.000Z",
	_metadata: null,
	_deleted: null,
	...overrides,
});
