import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
	type AccountDeletionAdapters,
	DELETE_CONFIRMATION,
	FRESH_OTP_MS,
	handleDeleteAccountRequest,
	otpSignedInAt,
} from "./account-deletion";

const NOW = Date.parse("2026-10-28T09:00:00Z");
const jwt = (claims: object) =>
	`x.${btoa(JSON.stringify(claims)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")}.y`;

// A fake server: one User, signed in by OTP at `otpAt`, blocked by `blocking` until it's empty.
const fake = (
	otpAt: number | null,
	blocking: { householdId: string; name: string }[] = [],
) => {
	const deleted: string[] = [];
	const purged: string[][] = [];
	const adapters: AccountDeletionAdapters = {
		userFor: async (token) => (token === "good" ? { id: "u1", otpAt } : null),
		blockers: async () => blocking,
		deleteAccount: vi.fn(async (userId: string) => {
			if (blocking.length > 0)
				return { status: "blocked" as const, households: blocking };
			deleted.push(userId);
			return { status: "deleted" as const, households: ["personal"] };
		}),
		purgeHouseholdFiles: async (ids) => {
			purged.push(ids);
		},
	};
	return { adapters, deleted, purged };
};
const post = (
	adapters: AccountDeletionAdapters,
	body: unknown,
	token = "good",
) =>
	handleDeleteAccountRequest(
		adapters,
		new Request("http://x", {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			body: JSON.stringify(body),
		}),
		NOW,
	);

describe("otpSignedInAt", () => {
	it("reads when the session signed in by email OTP, and nothing else", () => {
		expect(
			otpSignedInAt(
				jwt({ amr: [{ method: "otp", timestamp: 1_800_000_000 }] }),
			),
		).toBe(1_800_000_000_000);
		expect(
			otpSignedInAt(jwt({ amr: [{ method: "password", timestamp: 1 }] })),
		).toBe(null);
		expect(otpSignedInAt(jwt({ sub: "u1" }))).toBe(null);
		expect(otpSignedInAt("not-a-jwt")).toBe(null);
	});
});

describe("handleDeleteAccountRequest", () => {
	it("says which households block it", async () => {
		const { adapters } = fake(NOW, [{ householdId: "h1", name: "Family" }]);
		expect(await (await post(adapters, { action: "check" })).json()).toEqual({
			status: "ok",
			blockers: [{ householdId: "h1", name: "Family" }],
		});
	});

	it("deletes only for the signed-in User, typed confirmation and a fresh OTP given, then purges their files", async () => {
		const { adapters, deleted, purged } = fake(NOW - 60_000);
		expect(
			(
				await post(
					adapters,
					{ action: "delete", confirmation: DELETE_CONFIRMATION },
					"bad",
				)
			).status,
		).toBe(401);
		expect(
			await (
				await post(adapters, { action: "delete", confirmation: "delete" })
			).json(),
		).toEqual({
			status: "unconfirmed",
		});
		expect(deleted).toEqual([]);
		const response = await post(adapters, {
			action: "delete",
			confirmation: DELETE_CONFIRMATION,
		});
		expect([response.status, await response.json()]).toEqual([
			200,
			{ status: "deleted" },
		]);
		expect(deleted).toEqual(["u1"]);
		expect(purged).toEqual([["personal"]]);
	});

	it("never deletes without an OTP sign-in made for it just now", () => {
		fc.assert(
			fc.asyncProperty(
				fc.option(
					fc.integer({ min: -2 * FRESH_OTP_MS, max: 2 * FRESH_OTP_MS }),
				),
				async (ago) => {
					const otpAt = ago === null ? null : NOW - ago;
					const { adapters, deleted } = fake(otpAt);
					const response = await post(adapters, {
						action: "delete",
						confirmation: DELETE_CONFIRMATION,
					});
					const fresh =
						otpAt !== null &&
						NOW - otpAt <= FRESH_OTP_MS &&
						otpAt <= NOW + 60_000;
					expect(response.status).toBe(fresh ? 200 : 403);
					expect(deleted.length).toBe(fresh ? 1 : 0);
				},
			),
		);
	});

	it("answers blocked, with the households, when it is", async () => {
		const { adapters, deleted } = fake(NOW, [
			{ householdId: "h1", name: "Family" },
		]);
		const response = await post(adapters, {
			action: "delete",
			confirmation: DELETE_CONFIRMATION,
		});
		expect([response.status, await response.json()]).toEqual([
			409,
			{
				status: "blocked",
				households: [{ householdId: "h1", name: "Family" }],
			},
		]);
		expect(deleted).toEqual([]);
	});

	it("keeps the deletion even when purging the files fails (the daily purge gets them)", async () => {
		const { adapters } = fake(NOW);
		adapters.purgeHouseholdFiles = async () => {
			throw new Error("Storage down");
		};
		expect(
			(
				await post(adapters, {
					action: "delete",
					confirmation: DELETE_CONFIRMATION,
				})
			).status,
		).toBe(200);
	});

	it("refuses anything else", async () => {
		const { adapters } = fake(NOW);
		expect((await post(adapters, { action: "nope" })).status).toBe(400);
		expect(
			(
				await handleDeleteAccountRequest(
					adapters,
					new Request("http://x", {
						method: "GET",
						headers: { authorization: "Bearer good" },
					}),
					NOW,
				)
			).status,
		).toBe(405);
	});
});
