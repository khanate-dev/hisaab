import { type Appearance, appearanceOf } from "@hisaab/client-schema";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * This device's own settings (spec §4.1, §5): its appearance and whether the app lock is on. Kept apart from the
 * local database, which signing out wipes, as they belong to the device rather than to whoever is signed in.
 */
export type DeviceSettings = { appearance: Appearance; appLock: boolean };

const KEY = "hisaab.device-settings";
const DEFAULTS: DeviceSettings = { appearance: "system", appLock: false };

let current: DeviceSettings | undefined;
const listeners = new Set<() => void>();
const publish = (next: DeviceSettings) => {
	current = next;
	for (const listener of listeners) listener();
};

const read = (raw: string | null): DeviceSettings => {
	try {
		const saved =
			raw === null
				? {}
				: (JSON.parse(raw) as Partial<Record<keyof DeviceSettings, unknown>>);
		return {
			appearance: appearanceOf(String(saved.appearance)),
			appLock: saved.appLock === true,
		};
	} catch {
		return DEFAULTS;
	}
};

const loading = AsyncStorage.getItem(KEY)
	.then(read, () => DEFAULTS)
	.then((loaded) => {
		if (current === undefined) publish(loaded);
		return loaded;
	});

/** The settings once read from the device; undefined for the moment before. */
export const useDeviceSettings = () =>
	useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
	);

/** Changes this device's settings, here and in storage. */
export const updateDeviceSettings = async (
	changes: Partial<DeviceSettings>,
) => {
	const next = { ...(current ?? (await loading)), ...changes };
	publish(next);
	await AsyncStorage.setItem(KEY, JSON.stringify(next));
};
