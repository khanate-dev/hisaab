import { useSyncExternalStore } from "react";

/**
 * The Invite someone arrived by, kept through sign-in and naming themselves so onboarding ends with Join instead of
 * First Wallet (spec §4.3). In memory: a reload before joining sends them back to the link.
 */
export type PendingInvite = {
	token: string;
	/** The household joined, once accepted; onboarding waits for its Membership to sync. */
	joinedHouseholdId?: string;
};

let pending: PendingInvite | null = null;
const listeners = new Set<() => void>();

export const setPendingInvite = (next: PendingInvite | null) => {
	pending = next;
	for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const usePendingInvite = () =>
	useSyncExternalStore(
		subscribe,
		() => pending,
		() => pending,
	);
