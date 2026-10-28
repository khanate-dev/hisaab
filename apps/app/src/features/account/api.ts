import type { BlockingHousehold, DeleteAccountAnswer } from "@hisaab/domain";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

const FUNCTION = "delete-account";
const ACTION = { CHECK: "check", DELETE: "delete" } as const;
const EMAIL = "email";
const THIS_DEVICE = "local";
const OK = "ok";

/**
 * Calls the delete-account Edge Function, online only. Its answers are JSON with a `status` whatever the HTTP code,
 * so a 4xx is a result here, not a failure; only a network or server fault throws.
 */
const call = async (body: {
	action: "check" | "delete";
	confirmation?: string;
}) => {
	const { data, error } = await supabase.functions.invoke<DeleteAccountAnswer>(
		FUNCTION,
		{ body },
	);
	if (
		error instanceof FunctionsHttpError &&
		error.context instanceof Response
	) {
		const status = error.context.status;
		if (status >= 400 && status < 500)
			return (await error.context.json()) as DeleteAccountAnswer;
	}
	if (error) throw error;
	return data as DeleteAccountAnswer;
};

/** The shared households where the User is the only Admin with others in them: each blocks deleting the account. */
export const accountBlockers = async (): Promise<BlockingHousehold[]> => {
	const answer = await call({ action: ACTION.CHECK });
	if (answer.status !== OK) throw new Error(answer.status);
	return answer.blockers;
};

/** Emails a code to sign in afresh with, for the deletion; never makes a new User. */
export const sendDeletionCode = async (email: string) => {
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: { shouldCreateUser: false },
	});
	if (error) throw error;
};

/** Signs in again with the emailed code: the fresh OTP sign-in the deletion asks for. */
export const verifyDeletionCode = async (email: string, code: string) => {
	const { error } = await supabase.auth.verifyOtp({
		email,
		token: code,
		type: EMAIL,
	});
	if (error) throw error;
};

export const deleteAccount = (confirmation: string) =>
	call({ action: ACTION.DELETE, confirmation });

/** After the account's gone: signing out here wipes this device's local data (`SessionProvider`). */
export const forgetDeletedAccount = async () => {
	await supabase.auth.signOut({ scope: THIS_DEVICE });
};
