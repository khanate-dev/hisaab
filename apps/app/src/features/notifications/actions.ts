import {
	notificationPreferences,
	notifications,
	stamped,
} from "@hisaab/client-schema";
import { type NotificationTrigger, preferenceId } from "@hisaab/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { db } from "@/lib/powersync";

/** SQLite takes so many bound values at most; ids are marked in batches under that. */
const BATCH = 500;

/** Marks these Notifications read, once the User has seen them. */
export const markRead = async (ids: readonly string[]) => {
	const readAt = nowIso();
	await db.transaction(async (tx) => {
		for (let i = 0; i < ids.length; i += BATCH)
			await tx
				.update(notifications)
				.set(stamped({ read_at: readAt }))
				.where(
					and(
						inArray(notifications.id, ids.slice(i, i + BATCH)),
						isNull(notifications.read_at),
					),
				);
	});
};

/**
 * Records whether a trigger also reaches the User by push in a household. One row per trigger, under an id every
 * device derives (`preferenceId`), so two devices choosing offline write the same row and the last one wins.
 */
export const setPreference = async (
	{ householdId, userId }: { householdId: string; userId: string },
	trigger: NotificationTrigger,
	enabled: boolean,
) => {
	const id = preferenceId(userId, householdId, trigger);
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: notificationPreferences.id })
			.from(notificationPreferences)
			.where(eq(notificationPreferences.id, id));
		if (existing)
			await tx
				.update(notificationPreferences)
				.set(stamped({ enabled }))
				.where(eq(notificationPreferences.id, id));
		else
			await tx.insert(notificationPreferences).values(
				stamped({
					id,
					household_id: householdId,
					user_id: userId,
					trigger,
					enabled,
					created_at: nowIso(),
				}),
			);
	});
};
