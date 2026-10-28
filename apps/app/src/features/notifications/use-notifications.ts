import { notificationPreferences, notifications } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

/** The User's Notification inbox, across households, newest first; undefined while loading. */
export const useInbox = (userId: string) =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(notifications)
					.where(eq(notifications.user_id, userId))
					.orderBy(desc(notifications.created_at)),
			),
		),
	);

/** How many of the User's Notifications are unread, for the bell. */
export const useUnreadCount = (userId: string | undefined) =>
	useQuery(
		toCompilableQuery(
			db
				.select({ id: notifications.id })
				.from(notifications)
				.where(
					and(
						eq(notifications.user_id, userId ?? ""),
						isNull(notifications.read_at),
					),
				),
		),
	).data.length;

/** The User's own preferences in a household; undefined while loading. */
export const usePreferences = (householdId: string, userId: string) =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(notificationPreferences)
					.where(
						and(
							eq(notificationPreferences.household_id, householdId),
							eq(notificationPreferences.user_id, userId),
						),
					),
			),
		),
	);
