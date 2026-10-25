import { categories } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

import type { Category } from "./types";

/**
 * Every Category of the household, both lists, archived ones included; the domain sorts them into lists. Undefined
 * until the first read lands, so an empty list isn't shown while it's still loading.
 */
export const useCategories = (
	householdId: string | undefined,
): Category[] | undefined => {
	return whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(categories)
					.where(eq(categories.household_id, householdId ?? "")),
			),
		),
		householdId !== undefined,
	);
};
