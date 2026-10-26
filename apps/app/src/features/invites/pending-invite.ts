import {
	readDeviceState,
	updateDeviceState,
	useDeviceState,
} from "@/lib/device-state";

/**
 * The Invite someone arrived by, kept on the device through sign-in and naming themselves, so onboarding ends with
 * Join instead of First Wallet (spec §4.3), even across a reload.
 */
export type PendingInvite = {
	token: string;
	/** The household joined, once accepted; onboarding waits for its Membership to sync. */
	joinedHouseholdId: string | null;
};

/** Undefined until read; null when there's none. */
export const usePendingInvite = (): PendingInvite | null | undefined => {
	const state = useDeviceState();
	if (state === undefined) return undefined;
	return state.pending_invite_token === null
		? null
		: {
				token: state.pending_invite_token,
				joinedHouseholdId: state.pending_invite_household_id,
			};
};

export const setPendingInvite = (token: string) =>
	updateDeviceState({
		pending_invite_token: token,
		pending_invite_household_id: null,
	});

export const clearPendingInvite = () =>
	updateDeviceState({
		pending_invite_token: null,
		pending_invite_household_id: null,
	});

/** Records the household an Invite joined, when that's the Invite onboarding is waiting on. */
export const markPendingInviteJoined = async (
	token: string,
	householdId: string,
) => {
	const state = await readDeviceState();
	if (state.pending_invite_token === token)
		await updateDeviceState({ pending_invite_household_id: householdId });
};
