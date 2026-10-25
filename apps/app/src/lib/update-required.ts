import { useSyncExternalStore } from "react";

// Set when the server answers 426 (ADR-0009). It never resets: the newer build starts fresh.
let rejectedByServer = false;
const listeners = new Set<() => void>();

/** The upload connector calls this on a 426, in case the synced app_config hasn't arrived yet. */
export const markUpdateRequired = () => {
	if (rejectedByServer) return;
	rejectedByServer = true;
	for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const useServerRequiresUpdate = () =>
	useSyncExternalStore(subscribe, () => rejectedByServer);
