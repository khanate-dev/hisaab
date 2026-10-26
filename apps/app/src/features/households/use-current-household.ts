import { households, memberships } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq } from "drizzle-orm";

import { useDeviceState } from "@/lib/device-state";
import { db } from "@/lib/powersync";

import { isPersonalHousehold } from "./is-personal";

/**
 * The household on screen: the one last switched to on this device while the User still belongs to it, otherwise
 * their Personal household. Undefined until it has synced.
 */
export const useCurrentHousehold = (userId: string) => {
	const { data: mine } = useQuery(
		toCompilableQuery(
			db
				.select({ household: households })
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
	// Read before choosing, so a launch doesn't flash the Personal household first.
	const state = useDeviceState();
	if (state === undefined) return undefined;
	const rows = mine.map((row) => row.household);
	return (
		rows.find((household) => household.id === state.current_household_id) ??
		rows.find((household) => isPersonalHousehold(household, userId))
	);
};
