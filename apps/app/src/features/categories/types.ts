import type { categories } from "@hisaab/client-schema";

/** A Category row as it syncs to the device. */
export type Category = typeof categories.$inferSelect;

/** What the Category form edits; its list (Expense or Income) is fixed when it's made. */
export type CategoryDraft = {
	name: string;
	icon: string;
	color: string;
	/** The parent when it's a Subcategory; null for a top-level Category. */
	parentId: string | null;
};
