import { setCurrentHousehold } from "@/features/households/actions";

import { acceptInvite } from "./api";
import { setPendingInvite } from "./pending-invite";

/** Joins through an Invite and switches to its household; onboarding waits on the pending Invite until it syncs. */
export const joinInvite = async (token: string) => {
	const result = await acceptInvite(token);
	if (result.status === "joined" || result.status === "already_member") {
		setPendingInvite({ token, joinedHouseholdId: result.householdId });
		await setCurrentHousehold(result.householdId);
	}
	return result;
};
