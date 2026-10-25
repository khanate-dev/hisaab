import { categories, type CategoryKind, stamped } from "@hisaab/client-schema";
import { and, eq, isNull } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { CategoryDraft } from "./types";

export const createCategory = async (
	householdId: string,
	kind: CategoryKind,
	{ name, icon, color, parentId }: CategoryDraft,
) => {
	const id = newId();
	await db.insert(categories).values(
		stamped({
			id,
			household_id: householdId,
			kind,
			parent_id: parentId,
			name,
			icon,
			color,
			created_at: nowIso(),
		}),
	);
	return id;
};

export const updateCategory = async (
	categoryId: string,
	{ name, icon, color, parentId }: CategoryDraft,
) => {
	await db
		.update(categories)
		.set(stamped({ name, icon, color, parent_id: parentId }))
		.where(eq(categories.id, categoryId));
};

/** Archived with its Subcategories, so none is left under a parent that's gone from the list. */
export const archiveCategory = async (categoryId: string) => {
	const archivedAt = nowIso();
	await db.transaction(async (tx) => {
		await tx
			.update(categories)
			.set(stamped({ archived_at: archivedAt }))
			.where(eq(categories.id, categoryId));
		await tx
			.update(categories)
			.set(stamped({ archived_at: archivedAt }))
			.where(
				and(
					eq(categories.parent_id, categoryId),
					isNull(categories.archived_at),
				),
			);
	});
};

export const unarchiveCategory = async (categoryId: string) => {
	await db
		.update(categories)
		.set(stamped({ archived_at: null }))
		.where(eq(categories.id, categoryId));
};

/** Only an unused Category is deleted; one in use is archived (spec §3.3). The server refuses the rest. */
export const deleteCategory = async (categoryId: string) => {
	await db.delete(categories).where(eq(categories.id, categoryId));
};
