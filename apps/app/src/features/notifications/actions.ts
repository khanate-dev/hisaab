import {
	notificationDeliveries,
	notificationPreferences,
	stamped,
} from "@hisaab/client-schema";
import type { NotificationTrigger } from "@hisaab/domain";
import { and, inArray, isNull } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

/** Marks these Notifications read; the inbox does it once they've been shown. */
export const markRead = async (deliveryIds: readonly string[]) => {
	if (deliveryIds.length === 0) return;
	await db
		.update(notificationDeliveries)
		.set(stamped({ read_at: nowIso() }))
		.where(
			and(
				inArray(notificationDeliveries.id, [...deliveryIds]),
				isNull(notificationDeliveries.read_at),
			),
		);
};

/** Records the User's choice for a trigger in a household; the latest choice wins (`isOn`). */
export const setPreference = async (
	householdId: string,
	userId: string,
	trigger: NotificationTrigger,
	enabled: boolean,
) => {
	await db.insert(notificationPreferences).values(
		stamped({
			id: newId(),
			household_id: householdId,
			user_id: userId,
			trigger,
			enabled,
			created_at: nowIso(),
		}),
	);
};
