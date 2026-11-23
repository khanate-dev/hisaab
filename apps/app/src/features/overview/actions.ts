import { stamped, userSettings } from "@hisaab/client-schema";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { db } from "@/lib/powersync";

/** Picks the currency My overview is shown in (#53): the User's one settings row, under their own id. */
export const setDisplayCurrency = async (userId: string, currency: string) => {
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: userSettings.id })
			.from(userSettings)
			.where(eq(userSettings.id, userId));
		if (existing)
			await tx
				.update(userSettings)
				.set(stamped({ display_currency: currency }))
				.where(eq(userSettings.id, userId));
		else
			await tx.insert(userSettings).values(
				stamped({
					id: userId,
					display_currency: currency,
					created_at: nowIso(),
				}),
			);
	});
};
