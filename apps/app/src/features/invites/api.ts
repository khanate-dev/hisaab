import type { AcceptResult, InvitePreview } from "@hisaab/domain";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

const INVITE_FUNCTION = "accept-invite";
const ACTION = { PREVIEW: "preview", ACCEPT: "accept" } as const;

/**
 * Calls the accept-invite Edge Function, online only. Its answers are JSON with a `status` whatever the HTTP code,
 * so a 4xx is a result here, not a failure; only a network or server fault throws.
 */
const call = async <T>(body: {
	action: "preview" | "accept";
	token: string;
}) => {
	const { data, error } = await supabase.functions.invoke<T>(INVITE_FUNCTION, {
		body,
	});
	if (
		error instanceof FunctionsHttpError &&
		error.context instanceof Response
	) {
		const status = error.context.status;
		if (status >= 400 && status < 500) return (await error.context.json()) as T;
	}
	if (error) throw error;
	return data as T;
};

export const fetchInvitePreview = (token: string) =>
	call<InvitePreview>({ action: ACTION.PREVIEW, token });

export const acceptInvite = (token: string) =>
	call<AcceptResult>({ action: ACTION.ACCEPT, token });
