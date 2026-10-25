import { memberships } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

/**
 * Whether the signed-in User may record and manage the household's data (Wallets, Categories, Entries): Admins and
 * Members may, Viewers only look. Mirrors `private.can_write`; RLS decides, this only hides what would be refused.
 * Undefined until their Membership has synced.
 */
export const useCanWrite = (
	householdId: string | undefined,
	userId: string,
): boolean | undefined => {
	const role = useQuery(
		toCompilableQuery(
			db
				.select({ role: memberships.role })
				.from(memberships)
				.where(
					and(
						eq(memberships.household_id, householdId ?? ""),
						eq(memberships.user_id, userId),
					),
				),
		),
	).data[0]?.role;
	return role === undefined ? undefined : role !== "viewer";
};
