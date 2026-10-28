import { savedFilters, stamped, stampedDelete } from "@hisaab/client-schema";
import { type EntryFilter, writeSavedCriteria } from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

/** Saved for the signed-in User only (CONTEXT.md, Saved filter). */
export const saveFilter = async (
	householdId: string,
	userId: string,
	name: string,
	filter: EntryFilter,
) => {
	await db.insert(savedFilters).values(
		stamped({
			id: newId(),
			household_id: householdId,
			user_id: userId,
			name,
			criteria: writeSavedCriteria(filter),
			created_at: nowIso(),
		}),
	);
};

export const deleteSavedFilter = async (savedFilterId: string) => {
	await db
		.update(savedFilters)
		.set(stampedDelete())
		.where(eq(savedFilters.id, savedFilterId));
};
