import * as Linking from "expo-linking";

/** The link an Invite is shared as: the app's own invite landing, on the web or in the installed app. */
export const inviteLink = (token: string) =>
	Linking.createURL(`/invite/${token}`);
