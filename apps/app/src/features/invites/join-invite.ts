import { joinedHousehold } from "@hisaab/domain";

import { setCurrentHousehold } from "@/features/households/actions";

import { acceptInvite } from "./api";
import { markPendingInviteJoined } from "./pending-invite";

/** Joins through an Invite and switches to its household; onboarding, if it's waiting on this Invite, waits for it to sync. */
export const joinInvite = async (token: string) => {
	const result = await acceptInvite(token);
	const householdId = joinedHousehold(result);
	if (householdId !== null) {
		await markPendingInviteJoined(token, householdId);
		await setCurrentHousehold(householdId);
	}
	return result;
};
