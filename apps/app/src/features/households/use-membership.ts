import { memberships } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

/** The signed-in User's Membership in a household (their Role and default Wallet), once it has synced. */
export const useMembership = (
	householdId: string | undefined,
	userId: string,
) =>
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
	).data[0];
