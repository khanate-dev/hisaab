import { households, memberships } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

import type { HouseholdSummary } from "./household-list";

/** Every household the User belongs to, with their Role there, as a watched query. */
export const useHouseholds = (userId: string): HouseholdSummary[] => {
	const { data } = useQuery(
		toCompilableQuery(
			db
				.select({
					id: households.id,
					name: households.name,
					personalOwnerId: households.personal_owner_id,
					role: memberships.role,
				})
				.from(households)
				.innerJoin(
					memberships,
					and(
						eq(memberships.household_id, households.id),
						eq(memberships.user_id, userId),
					),
				),
		),
	);
	return data.map(({ personalOwnerId, ...household }) => ({
		...household,
		isPersonal: personalOwnerId === userId,
	}));
};
