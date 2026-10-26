const required = (name: string, value: string | undefined) => {
	if (!value)
		throw new Error(
			`${name} is not set; copy apps/app/.env.example to apps/app/.env.local.`,
		);
	return value;
};

// Expo inlines EXPO_PUBLIC_* only for literal `process.env.NAME` reads.
export const env = {
	supabaseUrl: required(
		"EXPO_PUBLIC_SUPABASE_URL",
		process.env.EXPO_PUBLIC_SUPABASE_URL,
	),
	supabasePublishableKey: required(
		"EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
		process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	),
	powersyncUrl: required(
		"EXPO_PUBLIC_POWERSYNC_URL",
		process.env.EXPO_PUBLIC_POWERSYNC_URL,
	),
	/** Where the web app lives, for links people open anywhere (Invites); unset, links use this app's own URL. */
	webUrl: process.env.EXPO_PUBLIC_WEB_URL || null,
};
