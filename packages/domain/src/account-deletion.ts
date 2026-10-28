// Account deletion (spec §3.1; issue #12; #64): immediate and server-side, behind a fresh email OTP and a typed
// confirmation. The `delete-account` Edge Function's request handling is here, behind adapters (ADR-0010); the
// deletion itself is one database transaction (`delete_account`).
// No imports: the Edge Function loads this file in Deno.

/** What the User types to confirm, exactly. */
export const DELETE_CONFIRMATION = "DELETE";

/** How recent the email OTP sign-in must be: one made for this, just now. */
export const FRESH_OTP_MS = 10 * 60_000;

/** A shared household that blocks deleting the account: the User is its only Admin and others are in it. */
export type BlockingHousehold = { householdId: string; name: string };

export type AccountDeletionAdapters = {
	/** The signed-in User a session token is for (checked with Auth), and when it signed in by email OTP. */
	userFor: (
		token: string,
	) => Promise<{ id: string; otpAt: number | null } | null>;
	blockers: (userId: string) => Promise<BlockingHousehold[]>;
	/** The one transaction: blocked (nothing done), or deleted, with the households hard-deleted. */
	deleteAccount: (
		userId: string,
	) => Promise<
		| { status: "blocked"; households: BlockingHousehold[] }
		| { status: "deleted"; households: string[] }
	>;
	/** Removes hard-deleted households' Attachment files from Storage at once (the daily purge catches any left). */
	purgeHouseholdFiles: (householdIds: string[]) => Promise<void>;
};

/**
 * When a session's JWT says it signed in by email OTP, in milliseconds since the epoch; null if it didn't. Supabase
 * lists sign-in methods in its `amr` claim, each with a timestamp in seconds.
 */
export const otpSignedInAt = (token: string): number | null => {
	const [, body] = token.split(".");
	if (!body) return null;
	let claims: unknown;
	try {
		claims = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
	} catch {
		return null;
	}
	const amr = (claims as { amr?: unknown } | null)?.amr;
	if (!Array.isArray(amr)) return null;
	const times = amr.flatMap((m: unknown) => {
		const { method, timestamp } = (m ?? {}) as {
			method?: unknown;
			timestamp?: unknown;
		};
		return method === "otp" && typeof timestamp === "number"
			? [timestamp * 1000]
			: [];
	});
	return times.length > 0 ? Math.max(...times) : null;
};

export type DeleteAccountAnswer =
	| { status: "ok"; blockers: BlockingHousehold[] }
	| { status: "deleted" }
	| { status: "blocked"; households: BlockingHousehold[] }
	| { status: "signed_out" | "stale_otp" | "unconfirmed" | "bad_request" };

const answer = (body: DeleteAccountAnswer, status: number) =>
	Response.json(body, { status });

/**
 * The `delete-account` Edge Function's request handling, for the signed-in User:
 * - `check`: which households block it (the UI offers to promote another Admin or delete each);
 * - `delete`: with the typed confirmation, and only within minutes of an email OTP sign-in made for it; then the one
 *   transaction, and the hard-deleted households' files purged straight after (a failure there is left to the daily
 *   purge, never undoing the deletion).
 */
export const handleDeleteAccountRequest = async (
	adapters: AccountDeletionAdapters,
	request: Request,
	now: number,
): Promise<Response> => {
	if (request.method !== "POST") return answer({ status: "bad_request" }, 405);
	const token = /^Bearer (.+)$/.exec(
		request.headers.get("authorization") ?? "",
	)?.[1];
	const user = token ? await adapters.userFor(token) : null;
	if (!user) return answer({ status: "signed_out" }, 401);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return answer({ status: "bad_request" }, 400);
	}
	const { action, confirmation } = (body ?? {}) as Record<string, unknown>;
	if (action === "check")
		return answer(
			{ status: "ok", blockers: await adapters.blockers(user.id) },
			200,
		);
	if (action !== "delete") return answer({ status: "bad_request" }, 400);
	if (confirmation !== DELETE_CONFIRMATION)
		return answer({ status: "unconfirmed" }, 400);
	if (
		user.otpAt === null ||
		now - user.otpAt > FRESH_OTP_MS ||
		user.otpAt > now + 60_000
	)
		return answer({ status: "stale_otp" }, 403);
	const result = await adapters.deleteAccount(user.id);
	if (result.status === "blocked")
		return answer({ status: "blocked", households: result.households }, 409);
	if (result.households.length > 0)
		await adapters.purgeHouseholdFiles(result.households).catch(() => {});
	return answer({ status: "deleted" }, 200);
};
