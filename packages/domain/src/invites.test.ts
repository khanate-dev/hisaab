import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	acceptInvite,
	encodeInviteToken,
	handleInviteRequest,
	type Invite,
	ROLES,
	INVITE_TOKEN_BYTES,
	type InviteAdapters,
	inviteStanding,
	isInviteToken,
	joinedHousehold,
	inviteTokenFromLink,
	normalizeEmail,
	previewInvite,
} from "./invites";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const TOKEN = "a".repeat(32);

const invite = fc.record({
	id: fc.uuid(),
	householdId: fc.uuid(),
	householdName: fc.string({ minLength: 1 }),
	role: fc.constantFrom(...ROLES),
	email: fc.option(fc.emailAddress().map(normalizeEmail)),
	expiresAt: fc
		.integer({ min: -30, max: 30 })
		.map((days) =>
			new Date(NOW.getTime() + days * 86_400_000 + 1).toISOString(),
		),
	revokedAt: fc.option(fc.constant("2026-10-20T00:00:00.000Z")),
	acceptedAt: fc.option(fc.constant("2026-10-21T00:00:00.000Z")),
}) satisfies fc.Arbitrary<Invite>;

/** In-memory adapters around one Invite, recording every redeem. */
const fakes = (
	stored: Invite | null,
	user: { id: string; email: string | null } | null,
	{ member = false, raced = false } = {},
) => {
	const redeemed: string[] = [];
	const adapters: InviteAdapters = {
		findInvite: async (token) => (token === TOKEN ? stored : null),
		currentUser: async (authorization) =>
			authorization === null ? null : user,
		isMember: async () => member,
		redeem: async (id) => {
			redeemed.push(id);
			return raced ? null : (stored?.householdId ?? null);
		},
		now: () => NOW,
	};
	return { adapters, redeemed };
};

describe("Invite tokens", () => {
	it("encode any 24 bytes as a 32-character URL-safe token", () => {
		fc.assert(
			fc.property(
				fc.uint8Array({
					minLength: INVITE_TOKEN_BYTES,
					maxLength: INVITE_TOKEN_BYTES,
				}),
				(bytes) => {
					expect(isInviteToken(encodeInviteToken(bytes))).toBe(true);
				},
			),
		);
	});

	it("are only what that encoding makes", () => {
		fc.assert(
			fc.property(
				fc.string().filter((s) => !/^[A-Za-z0-9_-]{32}$/.test(s)),
				(text) => {
					expect(isInviteToken(text)).toBe(false);
				},
			),
		);
	});
});

describe("inviteTokenFromLink", () => {
	const token = fc
		.uint8Array({
			minLength: INVITE_TOKEN_BYTES,
			maxLength: INVITE_TOKEN_BYTES,
		})
		.map(encodeInviteToken);

	it("finds the token in any link the app makes, or on its own", () => {
		fc.assert(
			fc.property(
				token,
				fc.constantFrom(
					"",
					"https://hisaab.app/invite/",
					"hisaab://invite/",
					"  http://localhost:8081/invite/",
				),
				fc.constantFrom("", "/", "?ref=chat", "#top", " "),
				(t, before, after) => {
					expect(inviteTokenFromLink(`${before}${t}${after}`)).toBe(t);
				},
			),
		);
	});

	it("finds none where there isn't one", () => {
		expect(inviteTokenFromLink("https://hisaab.app/invite/short")).toBeNull();
		expect(inviteTokenFromLink("")).toBeNull();
		expect(inviteTokenFromLink(`x${"a".repeat(32)}`)).toBeNull();
	});
});

describe("inviteStanding", () => {
	it("is open only while not revoked, not used and not yet expired", () => {
		fc.assert(
			fc.property(invite, (i) => {
				const open =
					i.revokedAt === null &&
					i.acceptedAt === null &&
					new Date(i.expiresAt) > NOW;
				expect(inviteStanding(i, NOW) === "open").toBe(open);
			}),
		);
	});

	it("says revoked or used before expired", () => {
		fc.assert(
			fc.property(invite, (i) => {
				const standing = inviteStanding(i, NOW);
				if (i.revokedAt !== null) expect(standing).toBe("revoked");
				else if (i.acceptedAt !== null) expect(standing).toBe("used");
			}),
		);
	});
});

describe("previewInvite", () => {
	it("shows the household and Role, and whether one email is required, never which", () => {
		fc.assert(
			fc.asyncProperty(invite, async (i) => {
				const preview = await previewInvite(fakes(i, null).adapters, TOKEN);
				expect(preview).toEqual({
					status: inviteStanding(i, NOW),
					householdName: i.householdName,
					role: i.role,
					emailRestricted: i.email !== null,
					expiresAt: i.expiresAt,
				});
				expect(JSON.stringify(preview)).not.toContain(i.email ?? "\u0000");
			}),
		);
	});

	it("finds nothing for a malformed or unknown token", async () => {
		const { adapters } = fakes(null, null);
		expect(await previewInvite(adapters, "nope")).toEqual({
			status: "not_found",
		});
		expect(await previewInvite(adapters, TOKEN)).toEqual({
			status: "not_found",
		});
	});
});

describe("acceptInvite", () => {
	it("joins only a signed-in non-member, through an open Invite, with its email if it has one", () => {
		fc.assert(
			fc.asyncProperty(
				invite,
				fc.option(fc.emailAddress()),
				fc.boolean(),
				fc.boolean(),
				async (i, email, member, signedIn) => {
					const { adapters, redeemed } = fakes(
						i,
						{ id: "u1", email },
						{ member },
					);
					const result = await acceptInvite(
						adapters,
						TOKEN,
						signedIn ? "Bearer x" : null,
					);
					const emailOk =
						i.email === null ||
						(email !== null && normalizeEmail(email) === i.email);
					const joins =
						signedIn && !member && inviteStanding(i, NOW) === "open" && emailOk;
					expect(result.status === "joined").toBe(joins);
					expect(redeemed).toEqual(joins ? [i.id] : []);
				},
			),
		);
	});

	it("matches the email whatever its case or spacing", async () => {
		const open: Invite = {
			id: "i1",
			householdId: "h1",
			householdName: "Family",
			role: "member",
			email: "sara@example.com",
			expiresAt: "2026-11-01T00:00:00.000Z",
			revokedAt: null,
			acceptedAt: null,
		};
		const { adapters } = fakes(open, { id: "u1", email: " Sara@Example.COM " });
		expect(await acceptInvite(adapters, TOKEN, "Bearer x")).toEqual({
			status: "joined",
			householdId: "h1",
		});
	});

	it("keeps a Member's Role and the Invite for someone else", async () => {
		fc.assert(
			fc.asyncProperty(invite, async (i) => {
				const { adapters, redeemed } = fakes(
					i,
					{ id: "u1", email: null },
					{ member: true },
				);
				expect(await acceptInvite(adapters, TOKEN, "Bearer x")).toEqual({
					status: "already_member",
					householdId: i.householdId,
				});
				expect(redeemed).toEqual([]);
			}),
		);
	});

	it("is used when another acceptance or a revoke wins the race", async () => {
		const open: Invite = {
			id: "i1",
			householdId: "h1",
			householdName: "Family",
			role: "viewer",
			email: null,
			expiresAt: "2026-11-01T00:00:00.000Z",
			revokedAt: null,
			acceptedAt: null,
		};
		const { adapters } = fakes(
			open,
			{ id: "u1", email: null },
			{ raced: true },
		);
		expect(await acceptInvite(adapters, TOKEN, "Bearer x")).toEqual({
			status: "used",
		});
	});
});

describe("joinedHousehold", () => {
	it("is the household for a join or a Member, and nothing otherwise", () => {
		expect(joinedHousehold({ status: "joined", householdId: "h1" })).toBe("h1");
		expect(
			joinedHousehold({ status: "already_member", householdId: "h1" }),
		).toBe("h1");
		for (const status of [
			"signed_out",
			"not_found",
			"wrong_email",
			"revoked",
			"used",
			"expired",
		] as const)
			expect(joinedHousehold({ status })).toBeNull();
	});
});

describe("handleInviteRequest", () => {
	const post = (body: unknown, authorization?: string) =>
		new Request("http://localhost/accept-invite", {
			method: "POST",
			headers: authorization ? { authorization } : {},
			body: JSON.stringify(body),
		});
	const open: Invite = {
		id: "i1",
		householdId: "h1",
		householdName: "Family",
		role: "member",
		email: null,
		expiresAt: "2026-11-01T00:00:00.000Z",
		revokedAt: null,
		acceptedAt: null,
	};

	it("previews without a sign-in and accepts with one", async () => {
		const { adapters } = fakes(open, { id: "u1", email: null });
		const preview = await handleInviteRequest(
			adapters,
			post({ action: "preview", token: TOKEN }),
		);
		expect(preview.status).toBe(200);
		expect(await preview.json()).toMatchObject({
			status: "open",
			role: "member",
		});
		const signedOut = await handleInviteRequest(
			adapters,
			post({ action: "accept", token: TOKEN }),
		);
		expect(signedOut.status).toBe(401);
		const joined = await handleInviteRequest(
			adapters,
			post({ action: "accept", token: TOKEN }, "Bearer x"),
		);
		expect(joined.status).toBe(200);
		expect(await joined.json()).toEqual({
			status: "joined",
			householdId: "h1",
		});
	});

	it("refuses anything but a well-formed POST", async () => {
		const { adapters } = fakes(open, null);
		expect(
			(
				await handleInviteRequest(
					adapters,
					post({ action: "steal", token: TOKEN }),
				)
			).status,
		).toBe(400);
		expect(
			(await handleInviteRequest(adapters, new Request("http://localhost/")))
				.status,
		).toBe(405);
		expect(
			(
				await handleInviteRequest(
					adapters,
					post({ action: "preview", token: "x" }),
				)
			).status,
		).toBe(404);
	});
});
