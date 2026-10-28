import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { preferenceId, ruleFollowerId } from "./notification-preferences";
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
	expoOutcome,
	expoOutcomes,
	pushMessage,
	webPushOutcome,
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

	it("tell someone no longer in the household only that they're out, whatever they chose there", () => {
		fc.assert(
			fc.property(trigger, fc.option(fc.boolean()), (t, enabled) => {
				expect(isOn(t, null, enabled === null ? undefined : { enabled })).toBe(
					t === "membership",
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

describe("ruleFollowerId", () => {
	it("matches what Postgres's uuid_generate_v5 derives, which the server checks it against", () => {
		expect(
			ruleFollowerId(
				"00000000-0000-7000-8000-000000001111",
				"00000000-0000-4000-8000-0000000011a1",
			),
		).toBe("b804ed60-839e-5335-a01d-30e3b9bcef7a");
	});

	it("is one per rule and User", () => {
		fc.assert(
			fc.property(
				fc.uuid(),
				fc.uuid(),
				fc.uuid(),
				fc.uuid(),
				(r, u, r2, u2) => {
					if (r !== r2 || u !== u2)
						expect(ruleFollowerId(r, u)).not.toBe(ruleFollowerId(r2, u2));
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
		const forget = vi.fn<DispatchAdapters["forget"]>(async () => {});
		return {
			forget,
			adapters: {
				claim: async () => claimed,
				settle,
				forget,
				receiptsDue: async () => [],
				settleReceipts: async () => {},
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
				? { status: "sent" as const, ticket: "k1" }
				: { status: "failed" as const, error: "timeout" },
		);
		const webpush = vi.fn(async (d: ClaimedDelivery) => {
			if (d.id === "d5") return { status: "dead" as const, error: "410" };
			throw new Error("boom");
		});
		expect(await dispatchDeliveries(adapters, { expo, webpush })).toBe(5);
		expect(settle).toHaveBeenCalledWith([
			{ id: "d1", status: "sent", error: null, ticket: "k1" },
			{ id: "d2", status: "failed", error: "boom", ticket: null },
			{
				id: "d3",
				status: "failed",
				error: "No sender for email yet",
				ticket: null,
			},
			{ id: "d4", status: "dead", error: "timeout", ticket: null },
			{ id: "d5", status: "dead", error: "410", ticket: null },
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

	it("sends a batching channel in batches, settling each delivery once as its batch says", () => {
		fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 0, max: 30 }),
				fc.integer({ min: 1, max: 7 }),
				fc.array(fc.boolean(), { maxLength: 30 }),
				async (count, size, sentFlags) => {
					const claimed = Array.from({ length: count }, (_, i) =>
						delivery(`d${i}`, "expo"),
					);
					const { adapters, settle } = store(claimed);
					const batches: number[] = [];
					await dispatchDeliveries(adapters, {
						expo: {
							size,
							send: async (chunk) => {
								batches.push(chunk.length);
								return chunk.map((d) =>
									sentFlags[Number(d.id.slice(1))]
										? { status: "sent" }
										: { status: "failed", error: "x" },
								);
							},
						},
					});
					expect(batches.every((n) => n <= size)).toBe(true);
					expect(batches.reduce((a, b) => a + b, 0)).toBe(count);
					const results = settle.mock.calls[0]?.[0] ?? [];
					expect(results.map((r) => r.id).toSorted()).toEqual(
						claimed.map((d) => d.id).toSorted(),
					);
					for (const r of results)
						expect(r.status).toBe(
							sentFlags[Number(r.id.slice(1))] ? "sent" : "failed",
						);
				},
			),
		);
	});

	it("fails a whole batch that throws, and a delivery its batch gave no outcome for", async () => {
		const { adapters, settle } = store([
			delivery("d1", "expo"),
			delivery("d2", "expo"),
			delivery("d3", "webpush"),
		]);
		await dispatchDeliveries(adapters, {
			expo: { size: 100, send: async () => [{ status: "sent" }] },
			webpush: {
				size: 100,
				send: async () => {
					throw new Error("down");
				},
			},
		});
		expect(settle.mock.calls[0]?.[0]).toEqual([
			{ id: "d1", status: "sent", error: null, ticket: null },
			{ id: "d2", status: "failed", error: "No outcome for it", ticket: null },
			{ id: "d3", status: "failed", error: "down", ticket: null },
		]);
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

describe("pushMessage", () => {
	it("says what happened in names only", () => {
		const payload = JSON.stringify({
			change: "joined",
			userId: "u2",
			name: "Bilal",
			role: "member",
			householdName: "Family",
		});
		expect(pushMessage("membership", payload)).toEqual({
			title: "Hisaab",
			body: "Bilal joined Family.",
		});
		expect(
			pushMessage("loan_due", JSON.stringify({ householdName: "Family" })),
		).toEqual({
			title: "Loan due",
			body: "In Family.",
		});
	});

	it("says the same whatever else the payload holds, so no amount ever rides along", () => {
		fc.assert(
			fc.property(
				trigger,
				fc.constantFrom("joined", "left", "removed", "role_changed"),
				role,
				fc.option(fc.string()),
				fc.string(),
				fc.dictionary(
					fc
						.string()
						.filter(
							(k) =>
								!["change", "userId", "name", "role", "householdName"].includes(
									k,
								),
						),
					fc.oneof(
						fc.double({ noNaN: true }),
						fc.stringMatching(/^-?\d{1,9}(\.\d{1,4})?$/),
					),
				),
				(t, change, r, name, household, money) => {
					const names = {
						change,
						userId: "u1",
						name,
						role: r,
						householdName: household,
					};
					const plain = pushMessage(t, JSON.stringify(names));
					expect(
						pushMessage(t, JSON.stringify({ ...money, ...names })),
					).toEqual(plain);
					// And built from nothing but the names: no digit appears that wasn't in one.
					if (!/\d/.test(`${name ?? ""}${household}`))
						expect(`${plain.title} ${plain.body}`).not.toMatch(/\d/);
				},
			),
		);
	});
});

describe("push outcomes", () => {
	it("forget a target the push service says is gone, and retry other failures", () => {
		expect(expoOutcome({ status: "ok", id: "t" })).toEqual({
			status: "sent",
			ticket: "t",
		});
		expect(
			expoOutcome({
				status: "error",
				details: { error: "DeviceNotRegistered" },
			}),
		).toEqual({
			status: "dead",
			error: "DeviceNotRegistered",
			gone: true,
		});
		expect(
			expoOutcome({
				status: "error",
				details: { error: "MessageRateExceeded" },
			}).status,
		).toBe("failed");
		expect(expoOutcome(undefined).status).toBe("failed");
		expect(webPushOutcome(201)).toEqual({ status: "sent" });
		expect(webPushOutcome(410)).toEqual(
			expect.objectContaining({ status: "dead", gone: true }),
		);
		expect(webPushOutcome(500).status).toBe("failed");
	});

	it("read a batch's tickets in order, failing any message Expo gave none", () => {
		expect(
			expoOutcomes(
				[
					{ status: "ok", id: "k1" },
					{ status: "error", details: { error: "DeviceNotRegistered" } },
				],
				3,
			).map((o) => o.status),
		).toEqual(["sent", "dead", "failed"]);
		expect(expoOutcomes(null, 2).map((o) => o.status)).toEqual([
			"failed",
			"failed",
		]);
	});

	it("give exactly one outcome per message, in order, whatever Expo answered", () => {
		const ticket = fc.oneof(
			fc.record({ status: fc.constant("ok" as const), id: fc.string() }),
			fc.record({
				status: fc.constant("error" as const),
				details: fc.record({
					error: fc.constantFrom("DeviceNotRegistered", "MessageRateExceeded"),
				}),
			}),
		);
		fc.assert(
			fc.property(
				fc.option(fc.array(ticket, { maxLength: 10 })),
				fc.nat({ max: 10 }),
				(tickets, count) => {
					const outcomes = expoOutcomes(tickets, count);
					expect(outcomes).toHaveLength(count);
					outcomes.forEach((o, i) =>
						expect(o).toEqual(expoOutcome(tickets?.[i])),
					);
				},
			),
		);
	});

	it("dispatch forgets the gone targets once each", async () => {
		const claimed: ClaimedDelivery[] = ["d1", "d2"].map((id) => ({
			id,
			notificationId: "n1",
			userId: "u1",
			channel: "expo",
			target: "ExponentPushToken[gone]",
			attempts: 1,
			trigger: "membership",
			payload: "{}",
		}));
		const forget = vi.fn<DispatchAdapters["forget"]>(async () => {});
		await dispatchDeliveries(
			{
				claim: async () => claimed,
				settle: async () => {},
				forget,
				receiptsDue: async () => [],
				settleReceipts: async () => {},
			},
			{
				expo: async () => ({
					status: "dead",
					error: "DeviceNotRegistered",
					gone: true,
				}),
			},
		);
		expect(forget).toHaveBeenCalledWith(["ExponentPushToken[gone]"]);
	});

	it("settle the receipts that are in, forget a device Expo says is gone, and leave the rest for later", async () => {
		const settleReceipts = vi.fn<DispatchAdapters["settleReceipts"]>(
			async () => {},
		);
		const forget = vi.fn<DispatchAdapters["forget"]>(async () => {});
		const fetchReceipts = vi.fn(async () => ({
			k1: { status: "ok" as const },
			k2: {
				status: "error" as const,
				details: { error: "DeviceNotRegistered" },
			},
		}));
		await dispatchDeliveries(
			{
				claim: async () => [],
				settle: async () => {},
				forget,
				receiptsDue: async () => [
					{ id: "d1", target: "ExponentPushToken[a]", ticket: "k1" },
					{ id: "d2", target: "ExponentPushToken[b]", ticket: "k2" },
					{ id: "d3", target: "ExponentPushToken[c]", ticket: "k3" },
				],
				settleReceipts,
			},
			{},
			fetchReceipts,
		);
		expect(fetchReceipts).toHaveBeenCalledWith(["k1", "k2", "k3"]);
		expect(settleReceipts).toHaveBeenCalledWith([
			{ id: "d1", error: null },
			{ id: "d2", error: "DeviceNotRegistered" },
		]);
		expect(forget).toHaveBeenCalledWith(["ExponentPushToken[b]"]);
	});
});
