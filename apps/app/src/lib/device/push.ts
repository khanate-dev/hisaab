import Constants from "expo-constants";
import {
	getExpoPushTokenAsync,
	requestPermissionsAsync,
} from "expo-notifications";
import { Platform } from "react-native";

import { registerDevice } from "./push-registration";

/** The EAS project an Expo push token belongs to; set up with the native release (#66). */
const projectId = () =>
	(Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
		?.eas?.projectId ?? null;

/** Whether this build can push at all: a native build with its EAS project. */
export const pushAvailable = async () => projectId() !== null;

/** Asks for permission (only from a press, in context) and registers this device's Expo token. */
export const turnOnPush = async (userId: string): Promise<"on" | "denied"> => {
	// The outcomes, as `PushState` names them.
	const id = projectId();
	if (id === null) return "denied";
	if (!(await requestPermissionsAsync()).granted) return "denied";
	const { data: token } = await getExpoPushTokenAsync({ projectId: id });
	await registerDevice(userId, {
		platform: Platform.OS === "ios" ? "ios" : "android",
		kind: "expo",
		token,
	});
	return "on";
};
