// Invites (spec §3.1): the accept-invite Edge Function's logic, behind injected adapters (ADR-0010), so it's tested
// with in-memory fakes. The function itself only wires the adapters to PostgREST and Auth. No imports: Deno loads
// this file as it is.

/**
 * A Member's Role within one household (CONTEXT.md), which an Invite presets. Mirrors the `memberships.role` and
 * `invites.role` checks in Postgres; it lives here so the accept-invite function loads it without imports.
 */
export const ROLES = ["admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** An Invite's token: 24 random bytes as unpadded base64url, 32 characters. */
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
export const INVITE_TOKEN_BYTES = 24;

export const isInviteToken = (text: string) => TOKEN.test(text);

/** The token in a pasted Invite link (or the bare token itself), or null when there's none. */
export const inviteTokenFromLink = (text: string) => {
	const match = /(?:^|\/)([A-Za-z0-9_-]{32})\/?(?:[?#].*)?$/.exec(text.trim());
	return match?.[1] ?? null;
};

/** A token from random bytes (the caller's CSPRNG): unpadded base64url. */
export const encodeInviteToken = (bytes: Uint8Array) => {
	if (bytes.length !== INVITE_TOKEN_BYTES)
		throw new Error(`An Invite token takes ${INVITE_TOKEN_BYTES} bytes`);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_");
};

/** How long a new Invite lasts, in days: the database allows a day to a month. */
export const INVITE_LIFETIMES = [1, 7, 30] as const;
export type InviteLifetime = (typeof INVITE_LIFETIMES)[number];

export const inviteExpiry = (createdAt: Date, days: InviteLifetime) =>
	new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);

/** An email as Invites keep and compare it: trimmed and lower-case. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type Invite = {
	id: string;
	householdId: string;
	householdName: string;
	role: Role;
	/** Normalized; null when anyone with the link may accept. */
	email: string | null;
	expiresAt: string;
	revokedAt: string | null;
	acceptedAt: string | null;
};

/** Whether an Invite can still be accepted, or why not. A revoked or used one says so even once it has expired. */
export type InviteStanding = "open" | "revoked" | "used" | "expired";

export const inviteStanding = (invite: Invite, now: Date): InviteStanding =>
	invite.revokedAt !== null
		? "revoked"
		: invite.acceptedAt !== null
			? "used"
			: new Date(invite.expiresAt).getTime() <= now.getTime()
				? "expired"
				: "open";

/** The signed-in User accepting, as Auth knows them. */
export type InviteUser = { id: string; email: string | null };

/** What the function needs from the world; each is a fake in tests. */
export type InviteAdapters = {
	/** The Invite with this token, with its household's name; null when there's none. */
	findInvite: (token: string) => Promise<Invite | null>;
	/** The User an Authorization header signs in, or null when it signs in nobody. */
	currentUser: (authorization: string | null) => Promise<InviteUser | null>;
	isMember: (householdId: string, userId: string) => Promise<boolean>;
	/** Marks the Invite accepted and adds the Membership, atomically; null when it stopped being open meanwhile. */
	redeem: (inviteId: string, userId: string) => Promise<string | null>;
	now: () => Date;
};

/** What the landing shows before anyone signs in: the household, the Role, and whether it can still be accepted. */
export type InvitePreview =
	| { status: "not_found" }
	| {
			status: InviteStanding;
			householdName: string;
			role: Role;
			/** Whether only one email may accept it; never which one. */
			emailRestricted: boolean;
			expiresAt: string;
	  };

export const previewInvite = async (
	adapters: Pick<InviteAdapters, "findInvite" | "now">,
	token: string,
): Promise<InvitePreview> => {
	const invite = isInviteToken(token) ? await adapters.findInvite(token) : null;
	if (!invite) return { status: "not_found" };
	return {
		status: inviteStanding(invite, adapters.now()),
		householdName: invite.householdName,
		role: invite.role,
		emailRestricted: invite.email !== null,
		expiresAt: invite.expiresAt,
	};
};

export type AcceptResult =
	| { status: "joined"; householdId: string }
	| { status: "already_member"; householdId: string }
	| { status: "signed_out" | "not_found" | "wrong_email" }
	| { status: Exclude<InviteStanding, "open"> };

/**
 * Accepts an Invite for the signed-in User. A User already in the household keeps their Role and leaves the Invite
 * for someone else; an Invite tied to an email takes only that email.
 */
export const acceptInvite = async (
	adapters: InviteAdapters,
	token: string,
	authorization: string | null,
): Promise<AcceptResult> => {
	const user = await adapters.currentUser(authorization);
	if (!user) return { status: "signed_out" };
	const invite = isInviteToken(token) ? await adapters.findInvite(token) : null;
	if (!invite) return { status: "not_found" };
	if (await adapters.isMember(invite.householdId, user.id))
		return { status: "already_member", householdId: invite.householdId };
	const standing = inviteStanding(invite, adapters.now());
	if (standing !== "open") return { status: standing };
	if (
		invite.email !== null &&
		(user.email === null || normalizeEmail(user.email) !== invite.email)
	)
		return { status: "wrong_email" };
	const householdId = await adapters.redeem(invite.id, user.id);
	// Revoked, used or expired between the read and the write.
	return householdId === null
		? { status: "used" }
		: { status: "joined", householdId };
};

const STATUS_CODES: Record<AcceptResult["status"], number> = {
	joined: 200,
	already_member: 200,
	signed_out: 401,
	not_found: 404,
	wrong_email: 403,
	revoked: 410,
	used: 410,
	expired: 410,
};

/**
 * The accept-invite function's request handling: `POST {action: "preview" | "accept", token}`. Preview needs no
 * sign-in; accept takes the User from the Authorization header. Answers JSON with the result's `status`.
 */
export const handleInviteRequest = async (
	adapters: InviteAdapters,
	request: Request,
): Promise<Response> => {
	if (request.method !== "POST")
		return Response.json({ status: "method_not_allowed" }, { status: 405 });
	const body: unknown = await request.json().catch(() => null);
	const action =
		body !== null && typeof body === "object" && "action" in body
			? body.action
			: null;
	const token =
		body !== null && typeof body === "object" && "token" in body
			? body.token
			: null;
	if (
		typeof token !== "string" ||
		(action !== "preview" && action !== "accept")
	)
		return Response.json({ status: "bad_request" }, { status: 400 });
	if (action === "preview") {
		const preview = await previewInvite(adapters, token);
		return Response.json(preview, {
			status: preview.status === "not_found" ? 404 : 200,
		});
	}
	const result = await acceptInvite(
		adapters,
		token,
		request.headers.get("authorization"),
	);
	return Response.json(result, { status: STATUS_CODES[result.status] });
};
