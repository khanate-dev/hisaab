import { recurringRuleFollowers, stamped } from "@hisaab/client-schema";
import { ruleFollowerId } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { db } from "@/lib/powersync";

/** Turns "Notify me" on or off for a Recurring rule, for the User; one row per rule and User, under its derived id. */
export const setFollowing = async (
	rule: { id: string; household_id: string },
	userId: string,
	enabled: boolean,
) => {
	const id = ruleFollowerId(rule.id, userId);
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: recurringRuleFollowers.id })
			.from(recurringRuleFollowers)
			.where(eq(recurringRuleFollowers.id, id));
		if (existing)
			await tx
				.update(recurringRuleFollowers)
				.set(stamped({ enabled }))
				.where(eq(recurringRuleFollowers.id, id));
		else
			await tx.insert(recurringRuleFollowers).values(
				stamped({
					id,
					household_id: rule.household_id,
					rule_id: rule.id,
					user_id: userId,
					enabled,
					created_at: nowIso(),
				}),
			);
	});
};

/** Whether the User has "Notify me" on for a rule. */
export const useFollowing = (ruleId: string, userId: string) =>
	useQuery(
		toCompilableQuery(
			db
				.select({ enabled: recurringRuleFollowers.enabled })
				.from(recurringRuleFollowers)
				.where(eq(recurringRuleFollowers.id, ruleFollowerId(ruleId, userId))),
		),
	).data[0]?.enabled === true;
