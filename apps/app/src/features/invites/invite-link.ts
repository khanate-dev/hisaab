import * as Linking from "expo-linking";

import { env } from "@/lib/env";

/**
 * The link an Invite is shared as: the web app's landing, which anyone can open, or this app's own URL (its scheme on
 * a device) when the web address isn't configured.
 */
export const inviteLink = (token: string) =>
	env.webUrl === null
		? Linking.createURL(`/invite/${token}`)
		: `${env.webUrl.replace(/\/$/, "")}/invite/${token}`;
