import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { preferenceId } from "./notification-preferences";
import {
	type ClaimedDelivery,
	defaultOn,
	type DispatchAdapters,
	dispatchDeliveries,
	DispatchForbidden,
	handleDispatchRequest,
	isOn,
	MAX_ATTEMPTS,
	mayBeServiceKey,
	type MemberRole,
	NOTIFICATION_TRIGGERS,
	readMembershipPayload,
} from "./notifications";

const role = fc.constantFrom<MemberRole>("admin", "member", "viewer");
const trigger = fc.constantFrom(...NOTIFICATION_TRIGGERS);

describe("defaultOn and isOn", () => {
	it("give Viewers only the Monthly summary and nobody the activity digest unasked", () => {
		expect(NOTIFICATION_TRIGGERS.filter((t) => defaultOn(t, "viewer"))).toEqual(
			["monthly_summary"],
		);
		expect(
			NOTIFICATION_TRIGGERS.filter((t) => !defaultOn(t, "member")),
		).toEqual(["household_activity"]);
	});

	it("follow the User's own choice when there is one, else the Role's default", () => {
		fc.assert(
			fc.property(trigger, role, fc.option(fc.boolean()), (t, r, enabled) => {
				expect(isOn(t, r, enabled === null ? undefined : { enabled })).toBe(
					enabled ?? defaultOn(t, r),
				);
			}),
		);
	});
});

describe("readMembershipPayload", () => {
	it("reads what the Membership trigger writes, and nothing malformed", () => {
		const payload = {
			change: "joined",
			userId: "u2",
			name: "Bilal",
			role: "member",
			householdName: "Family",
		};
		expect(readMembershipPayload(JSON.stringify(payload))).toEqual(payload);
		expect(
			readMembershipPayload(JSON.stringify({ ...payload, name: null }))?.name,
		).toBeNull();
		for (const bad of [
			"nope",
			"null",
			"[]",
			JSON.stringify({ ...payload, change: "exploded" }),
			JSON.stringify({ ...payload, role: "owner" }),
		])
			expect(readMembershipPayload(bad)).toBeNull();
	});
});

describe("preferenceId", () => {
	it("matches what Postgres's uuid_generate_v5 derives, which the server checks it against", () => {
		expect(
			preferenceId(
				"00000000-0000-4000-8000-0000000011a1",
				"00000000-0000-7000-8000-0000000011f1",
				"membership",
			),
		).toBe("c77a5500-dcc4-50a2-b152-7d77342f026a");
	});

	it("is one per User, household and trigger", () => {
		fc.assert(
			fc.property(
				fc.uuid(),
				fc.uuid(),
				trigger,
				fc.uuid(),
				trigger,
				(u, h, t, u2, t2) => {
					expect(preferenceId(u, h, t)).toBe(preferenceId(u, h, t));
					if (u !== u2 || t !== t2)
						expect(preferenceId(u, h, t)).not.toBe(preferenceId(u2, h, t2));
				},
			),
		);
	});
});

describe("mayBeServiceKey", () => {
	const jwt = (claims: object) =>
		`x.${btoa(JSON.stringify(claims)).replaceAll("=", "")}.y`;
	it("lets a secret key or a service-role JWT on to the database, and nothing else", () => {
		expect(mayBeServiceKey("sb_secret_abc")).toBe(true);
		expect(mayBeServiceKey(jwt({ role: "service_role" }))).toBe(true);
		expect(mayBeServiceKey(jwt({ role: "anon" }))).toBe(false);
		expect(mayBeServiceKey(jwt({ role: "authenticated", sub: "u1" }))).toBe(
			false,
		);
		expect(mayBeServiceKey("sb_publishable_abc")).toBe(false);
		expect(mayBeServiceKey("not.a-jwt.at-all")).toBe(false);
	});
});

describe("dispatchDeliveries", () => {
	const delivery = (
		id: string,
		channel: ClaimedDelivery["channel"],
		attempts = 1,
	): ClaimedDelivery => ({
		id,
		notificationId: "n1",
		userId: "u1",
		channel,
		target: "t",
		attempts,
		trigger: "membership",
		payload: "{}",
	});
	const store = (claimed: ClaimedDelivery[]) => {
		const settle = vi.fn<DispatchAdapters["settle"]>(async () => {});
		return {
			adapters: {
				claim: async () => claimed,
				settle,
			} satisfies DispatchAdapters,
			settle,
		};
	};

	it("settles each claimed delivery as its sender says, failing a channel with none, and dead past the attempts", async () => {
		const { adapters, settle } = store([
			delivery("d1", "expo"),
			delivery("d2", "webpush"),
			delivery("d3", "email"),
			delivery("d4", "expo", MAX_ATTEMPTS),
			delivery("d5", "webpush", MAX_ATTEMPTS),
		]);
		const expo = vi.fn(async (d: ClaimedDelivery) =>
			d.id === "d1"
				? { status: "sent" as const }
				: { status: "failed" as const, error: "timeout" },
		);
		const webpush = vi.fn(async (d: ClaimedDelivery) => {
			if (d.id === "d5") return { status: "dead" as const, error: "410" };
			throw new Error("boom");
		});
		expect(await dispatchDeliveries(adapters, { expo, webpush })).toBe(5);
		expect(settle).toHaveBeenCalledWith([
			{ id: "d1", status: "sent", error: null },
			{ id: "d2", status: "failed", error: "boom" },
			{ id: "d3", status: "failed", error: "No sender for email yet" },
			{ id: "d4", status: "dead", error: "timeout" },
			{ id: "d5", status: "dead", error: "410" },
		]);
	});

	it("never settles a delivery as sent unless its sender sent it", () => {
		fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						attempts: fc.integer({ min: 1, max: 7 }),
						sent: fc.boolean(),
					}),
					{ maxLength: 8 },
				),
				async (rows) => {
					const claimed = rows.map((r, i) =>
						delivery(`d${i}`, "expo", r.attempts),
					);
					const { adapters, settle } = store(claimed);
					await dispatchDeliveries(adapters, {
						expo: async (d) =>
							rows[Number(d.id.slice(1))]?.sent
								? { status: "sent" }
								: { status: "failed", error: "x" },
					});
					const results = settle.mock.calls[0]?.[0] ?? [];
					results.forEach((r, i) => {
						const row = rows[i];
						if (!row) return;
						expect(r.status).toBe(
							row.sent
								? "sent"
								: row.attempts >= MAX_ATTEMPTS
									? "dead"
									: "failed",
						);
					});
				},
			),
		);
	});

	it("runs with the caller's key, refused unless the database takes it as the service role's", async () => {
		const { adapters } = store([]);
		const service = "sb_secret_abc";
		const forKey = (key: string): DispatchAdapters =>
			key === service
				? adapters
				: {
						...adapters,
						claim: async () => {
							throw new DispatchForbidden();
						},
					};
		const post = (headers: Record<string, string>) =>
			handleDispatchRequest(
				forKey,
				{},
				new Request("http://x", { method: "POST", headers }),
			);
		expect((await post({})).status).toBe(403);
		expect((await post({ authorization: "Bearer nope" })).status).toBe(403);
		// Looks like a secret key, but the database says otherwise.
		expect(
			(await post({ authorization: "Bearer sb_secret_wrong" })).status,
		).toBe(403);
		expect(
			await (await post({ authorization: `Bearer ${service}` })).json(),
		).toEqual({
			status: "ok",
			settled: 0,
		});
	});
});
