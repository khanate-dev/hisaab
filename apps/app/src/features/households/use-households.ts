import { households, memberships, type Role } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

export type HouseholdSummary = {
	id: string;
	name: string;
	isPersonal: boolean;
	/** The signed-in User's Role in the household. */
	role: Role;
};

/** Every household the User belongs to, with their Role there, as a watched query. */
export const useHouseholds = (userId: string): HouseholdSummary[] => {
	const { data } = useQuery(
		toCompilableQuery(
			db
				.select({
					id: households.id,
					name: households.name,
					personalUserId: households.personal_user_id,
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
	return data.map(({ personalUserId, ...household }) => ({
		...household,
		isPersonal: personalUserId === userId,
	}));
};
