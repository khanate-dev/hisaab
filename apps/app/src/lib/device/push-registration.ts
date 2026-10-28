import { supabase } from "../supabase";

import { deviceId } from "./device-id";

/** Records this device's push target for the signed-in User (an online call; the server keeps it). */
export const registerDevice = async (
	userId: string,
	target: {
		platform: "ios" | "android" | "web";
		kind: "expo" | "webpush";
		token: string;
	},
) => {
	const { error } = await supabase.from("devices").upsert({
		id: await deviceId(),
		user_id: userId,
		platform: target.platform,
		push_kind: target.kind,
		push_token: target.token,
		last_seen_at: new Date().toISOString(),
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
