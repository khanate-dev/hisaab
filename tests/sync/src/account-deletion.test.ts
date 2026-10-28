import {
	CONTRACT_VERSION,
	CONTRACT_VERSION_HEADER,
} from "@hisaab/client-schema";
import { DELETE_CONFIRMATION } from "@hisaab/domain";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it } from "vitest";

import { seedHousehold } from "./seed";
import { stack } from "./stack";
import { adminClient, type SignedInUser } from "./users";

// #64: the delete-account Edge Function, end to end with a real email OTP session (the harness signs Users in that
// way, just now): blocked while the sole Admin of a household with others; otherwise the User is gone and what they
// made stays, as their household's Former member.
const ask = async (user: SignedInUser, body: object) => {
	const response = await fetch(
		`${stack.supabaseUrl}/functions/v1/delete-account`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${user.accessToken}`,
				apikey: stack.publishableKey,
				"content-type": "application/json",
				[CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
			},
			body: JSON.stringify(body),
		},
	);
	return {
		status: response.status,
		body: (await response.json()) as Record<string, unknown>,
	};
};

describe("delete-account", () => {
	it("is blocked for the sole Admin of a household with others in it", async () => {
		const { users, household } = await seedHousehold({
			sole: "admin",
			other: "member",
		});
		expect(await ask(users.sole, { action: "check" })).toEqual({
			status: 200,
			body: {
				status: "ok",
				blockers: [{ householdId: household, name: "Family" }],
			},
		});
		expect(
			(
				await ask(users.sole, {
					action: "delete",
					confirmation: DELETE_CONFIRMATION,
				})
			).status,
		).toBe(409);
		const { data } = await adminClient().auth.admin.getUserById(users.sole.id);
		expect(data.user?.id).toBe(users.sole.id);
	});

	it("deletes the User, typed confirmation given, and keeps what they made as their Former member's", async () => {
		const admin = adminClient();
		const { users, household } = await seedHousehold({
			leaver: "admin",
			stayer: "admin",
		});
		const wallet = uuidv7();
		const entry = uuidv7();
		for (const [table, row] of [
			[
				"wallets",
				{
					id: wallet,
					household_id: household,
					name: "Cash",
					type: "cash",
					currency: "PKR",
				},
			],
			[
				"entries",
				{
					id: entry,
					household_id: household,
					wallet_id: wallet,
					kind: "balance_adjustment",
					amount: "100",
					occurred_on: "2026-10-01",
					created_by: users.leaver.id,
				},
			],
		] as const) {
			const { error } = await admin.from(table).insert(row);
			if (error) throw error;
		}

		expect(
			(await ask(users.leaver, { action: "delete", confirmation: "delete" }))
				.body,
		).toEqual({
			status: "unconfirmed",
		});
		expect(
			await ask(users.leaver, {
				action: "delete",
				confirmation: DELETE_CONFIRMATION,
			}),
		).toEqual({
			status: 200,
			body: { status: "deleted" },
		});

		const { data: gone } = await admin.auth.admin.getUserById(users.leaver.id);
		expect(gone.user).toBeNull();
		const { data: former } = await admin
			.from("former_members")
			.select("id, number")
			.eq("household_id", household);
		const { data: kept } = await admin
			.from("entries")
			.select("created_by")
			.eq("id", entry);
		expect(former).toHaveLength(1);
		expect(kept).toEqual([{ created_by: former?.[0]?.id }]);
	});
});
