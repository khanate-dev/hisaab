import { households, stamped } from "@hisaab/client-schema";
import { eq } from "drizzle-orm";
import { useEffect } from "react";

import { deviceTimeZone } from "@/lib/dates";
import { db } from "@/lib/powersync";

import { usePersonalHousehold } from "./use-personal-household";

/**
 * A Personal household onboarded before timezones were recorded takes this device's, once, so every device dates
 * its Entries the same way. Only its owner (its Admin) sets it; household settings change it later (#40).
 */
export const useFillHouseholdTimeZone = (userId: string) => {
	const household = usePersonalHousehold(userId);
	useEffect(() => {
		if (household?.timezone !== null || household.personal_user_id !== userId)
			return;
		void db
			.update(households)
			.set(stamped({ timezone: deviceTimeZone() }))
			.where(eq(households.id, household.id));
	}, [household, userId]);
};
