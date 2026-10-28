import { savedFilters } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

export type SavedFilter = typeof savedFilters.$inferSelect;

/** The signed-in User's Saved filters in a household, by name; only theirs ever syncs. Undefined while loading. */
export const useSavedFilters = (
	householdId: string | undefined,
	userId: string,
): SavedFilter[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(savedFilters)
					.where(
						and(
							eq(savedFilters.household_id, householdId ?? ""),
							eq(savedFilters.user_id, userId),
						),
					)
					.orderBy(asc(savedFilters.name)),
			),
		),
		householdId !== undefined,
	);
