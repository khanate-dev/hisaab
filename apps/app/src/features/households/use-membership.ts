import { memberships } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

/**
 * The signed-in User's Membership in a household (their Role and default Wallet): undefined while loading, null when
 * they don't belong to it (or it hasn't synced).
 */
export const useMembership = (
	householdId: string | undefined,
	userId: string,
) => {
	const rows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(memberships)
					.where(
						and(
							eq(memberships.household_id, householdId ?? ""),
							eq(memberships.user_id, userId),
						),
					),
			),
		),
		householdId !== undefined,
	);
	return rows === undefined ? undefined : (rows[0] ?? null);
};
