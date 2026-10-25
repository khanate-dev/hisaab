import { CONTRACT_VERSION } from "@hisaab/client-schema";
import { CONTRACT_VERSION_HEADER } from "@hisaab/domain";
import { createClient } from "@supabase/supabase-js";

import { stack } from "./stack";

export type SignedInUser = { id: string; accessToken: string };

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** A service-role client: bypasses RLS, for seeding. */
export const adminClient = () =>
	createClient(stack.supabaseUrl, stack.secretKey, noSession);

/** A client acting as the signed-in User, so every read goes through RLS. */
/**
 * A client acting as the signed-in User, so every read goes through RLS. It sends this build's contract version,
 * as the app does; pass another (or null for none) to play an older or broken build.
 */
export const userClient = (
	user: SignedInUser,
	contractVersion: number | null = CONTRACT_VERSION,
) =>
	createClient(stack.supabaseUrl, stack.publishableKey, {
		...noSession,
		global: {
			headers: {
				Authorization: `Bearer ${user.accessToken}`,
				...(contractVersion === null
					? {}
					: { [CONTRACT_VERSION_HEADER]: String(contractVersion) }),
			},
		},
	});

/** Creates a fresh User and signs them in through the email OTP flow. */
export const signInNewUser = async (): Promise<SignedInUser> => {
	const admin = adminClient();
	const email = `user-${crypto.randomUUID()}@example.com`;

	const created = await admin.auth.admin.createUser({
		email,
		email_confirm: true,
	});
	if (created.error) throw created.error;
	const link = await admin.auth.admin.generateLink({
		type: "magiclink",
		email,
	});
	if (link.error) throw link.error;

	const client = createClient(
		stack.supabaseUrl,
		stack.publishableKey,
		noSession,
	);
	const verified = await client.auth.verifyOtp({
		email,
		token: link.data.properties.email_otp,
		type: "email",
	});
	if (verified.error) throw verified.error;
	if (!verified.data.session) throw new Error("verifyOtp returned no session");
	return {
		id: created.data.user.id,
		accessToken: verified.data.session.access_token,
	};
};
