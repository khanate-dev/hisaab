import { supabase } from "../supabase";

import { deviceId } from "./device-id";

/** A device's push target: its Expo token, or its Web Push subscription as JSON. */
export type PushTarget = {
	platform: "ios" | "android" | "web";
	kind: "expo" | "webpush";
	token: string;
};

/**
 * Records this device's push target for the signed-in User (an online call; the server keeps it). The server takes the
 * device or token over from anyone who left it there, so a shared device never pushes the last User's Notifications.
 */
export const registerDevice = async (target: PushTarget) => {
	const { error } = await supabase.rpc("register_device", {
		device_id: await deviceId(),
		device_platform: target.platform,
		kind: target.kind,
		token: target.token,
	});
	if (error) throw error;
};

/** Forgets this device's push target, say on turning push off or signing out (#13: sign-out deletes it at once). */
export const forgetDevice = async () => {
	const { error } = await supabase
		.from("devices")
		.delete()
		.eq("id", await deviceId());
	if (error) throw error;
};

/** Whether this device has push on for the signed-in User. */
export const deviceRegistered = async () => {
	const { data, error } = await supabase
		.from("devices")
		.select("id")
		.eq("id", await deviceId());
	if (error) throw error;
	return data.length > 0;
};
