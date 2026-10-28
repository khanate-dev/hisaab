import Constants from "expo-constants";
import {
	AndroidImportance,
	getExpoPushTokenAsync,
	getPermissionsAsync,
	requestPermissionsAsync,
	setNotificationChannelAsync,
} from "expo-notifications";
import { Platform } from "react-native";

import {
	deviceRegistered,
	type PushTarget,
	registerDevice,
} from "./push-registration";

/** The EAS project an Expo push token belongs to; set up with the native release (#66). */
const projectId = () =>
	(Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
		?.eas?.projectId ?? null;

/** Whether this build can push at all: a native build with its EAS project. */
export const pushAvailable = async () => projectId() !== null;

/** Whether the device has blocked notifications for the app (asked and refused, or turned off in settings). */
export const pushBlocked = async () => {
	const { granted, canAskAgain } = await getPermissionsAsync();
	return !granted && !canAskAgain;
};

const target = async (id: string): Promise<PushTarget> => ({
	platform: Platform.OS === "ios" ? "ios" : "android",
	kind: "expo",
	token: (await getExpoPushTokenAsync({ projectId: id })).data,
});

/** Asks for permission (only from a press, in context) and registers this device's Expo token. */
export const turnOnPush = async (): Promise<"on" | "denied"> => {
	// The outcomes, as `PushState` names them.
	const id = projectId();
	if (id === null) return "denied";
	// Android 13+ asks only once a channel exists, and shows pushes through it.
	if (Platform.OS === "android")
		await setNotificationChannelAsync("default", {
			name: "Hisaab",
			importance: AndroidImportance.DEFAULT,
		});
	if (!(await requestPermissionsAsync()).granted) return "denied";
	await registerDevice(await target(id));
	return "on";
};

/** On launch, where push is on (turned on here and still allowed): registers the token again, as it may have changed, and so the device is seen. */
export const refreshPush = async () => {
	const id = projectId();
	if (id === null || !(await getPermissionsAsync()).granted) return;
	if (!(await deviceRegistered())) return;
	await registerDevice(await target(id));
};
