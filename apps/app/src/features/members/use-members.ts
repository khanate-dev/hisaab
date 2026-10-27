import { memberships, profiles, type Role } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

export type Member = {
	membershipId: string;
	userId: string;
	/** Null until their profile has synced. */
	name: string | null;
	role: Role;
};

/** The household's Members with their Roles, longest-standing first; undefined while loading. */
export const useMembers = (
	householdId: string | undefined,
): Member[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({
						membershipId: memberships.id,
						userId: memberships.user_id,
						name: profiles.display_name,
						role: memberships.role,
					})
					.from(memberships)
					.leftJoin(profiles, eq(profiles.id, memberships.user_id))
					.where(eq(memberships.household_id, householdId ?? ""))
					.orderBy(asc(memberships.created_at)),
			),
		),
		householdId !== undefined,
	);
