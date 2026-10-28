import {
	notificationDeliveries,
	notificationPreferences,
} from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

/** The User's Notification inbox, across households, newest first; undefined while loading. */
export const useInbox = (userId: string) =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(notificationDeliveries)
					.where(eq(notificationDeliveries.user_id, userId))
					.orderBy(desc(notificationDeliveries.created_at)),
			),
		),
	);

/** The User's own preferences in a household; undefined while loading. */
export const usePreferences = (
	householdId: string | undefined,
	userId: string,
) =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(notificationPreferences)
					.where(
						and(
							eq(notificationPreferences.household_id, householdId ?? ""),
							eq(notificationPreferences.user_id, userId),
						),
					),
			),
		),
		householdId !== undefined,
	);
