import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
	defaultOn,
	type Delivery,
	type DrainAdapters,
	DrainForbidden,
	drainNotifications,
	handleDrainRequest,
	isOn,
	type MemberRole,
	NOTIFICATION_TRIGGERS,
	type NotificationPreference,
	type OutboxNotification,
	recipients,
} from "./notifications";

const role = fc.constantFrom<MemberRole>("admin", "member", "viewer");
const trigger = fc.constantFrom(...NOTIFICATION_TRIGGERS);
const members = fc.uniqueArray(
	fc.record({ userId: fc.constantFrom("u1", "u2", "u3", "u4"), role }),
	{
		selector: (m) => m.userId,
		maxLength: 4,
	},
);
const preferences = fc.array(
	fc.record({
		user_id: fc.constantFrom("u1", "u2", "u3", "u4"),
		trigger,
		enabled: fc.boolean(),
		created_at: fc.constantFrom(
			"2026-10-01T00:00:00Z",
			"2026-10-02T00:00:00Z",
			"2026-10-03T00:00:00Z",
		),
	}),
	{ maxLength: 8 },
);

const membership = (
	subjectUserId: string | null = "u2",
): OutboxNotification => ({
	id: "n1",
	householdId: "h1",
	trigger: "membership",
	subjectUserId,
	payload: JSON.stringify({ change: "joined", userId: subjectUserId }),
});

describe("defaultOn", () => {
	it("gives Viewers only the Monthly summary and nobody the activity digest unasked", () => {
		expect(NOTIFICATION_TRIGGERS.filter((t) => defaultOn(t, "viewer"))).toEqual(
			["monthly_summary"],
		);
		expect(
			NOTIFICATION_TRIGGERS.filter((t) => !defaultOn(t, "member")),
		).toEqual(["household_activity"]);
	});
});

describe("isOn", () => {
	it("is the User's latest choice for the trigger, else their Role's default", () => {
		fc.assert(
			fc.property(trigger, role, preferences, (t, r, prefs) => {
				const mine = prefs.filter((p) => p.user_id === "u1" && p.trigger === t);
				const latest = mine.reduce<NotificationPreference | undefined>(
					(a, p) => (!a || p.created_at > a.created_at ? p : a),
					undefined,
				);
				expect(isOn(t, { userId: "u1", role: r }, prefs)).toBe(
					latest ? latest.enabled : defaultOn(t, r),
				);
			}),
		);
	});
});

describe("recipients", () => {
	it("are a Membership change's Admins and the person it's about, if they want it", () => {
		const people = [
			{ userId: "u1", role: "admin" as const },
			{ userId: "u2", role: "member" as const },
			{ userId: "u3", role: "member" as const },
		];
		expect(recipients(membership(), people, []).toSorted()).toEqual([
			"u1",
			"u2",
		]);
		expect(
			recipients(membership(), people, [
				{
					user_id: "u1",
					trigger: "membership",
					enabled: false,
					created_at: "x",
				},
			]),
		).toEqual(["u2"]);
	});

	it("reach someone who just left, though they're no longer a Member", () => {
		expect(
			recipients(
				membership("u9"),
				[{ userId: "u1", role: "admin" }],
				[],
			).toSorted(),
		).toEqual(["u1", "u9"]);
	});

	it("are only ever people it's on for, each once", () => {
		fc.assert(
			fc.property(members, preferences, trigger, (people, prefs, t) => {
				const got = recipients({ ...membership(), trigger: t }, people, prefs);
				expect(new Set(got).size).toBe(got.length);
				for (const userId of got) {
					const member = people.find((m) => m.userId === userId) ?? {
						userId,
						role: "member" as const,
					};
					expect(isOn(t, member, prefs)).toBe(true);
				}
			}),
		);
	});
});

describe("drainNotifications", () => {
	const adapters = (pending: OutboxNotification[]) => {
		const deliver = vi.fn(async (_d: Delivery[], _ids: string[]) => {});
		const store: DrainAdapters = {
			pending: async () => pending,
			members: async () => [
				{ userId: "u1", role: "admin" },
				{ userId: "u2", role: "member" },
			],
			preferences: async () => [],
			deliver,
		};
		return { store, deliver };
	};

	it("delivers each pending Notification to its recipients' inboxes and marks it drained", async () => {
		const { store, deliver } = adapters([membership("u2")]);
		expect(await drainNotifications(store)).toBe(1);
		expect(deliver).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					userId: "u1",
					channel: "inbox",
					trigger: "membership",
				}),
				expect.objectContaining({
					userId: "u2",
					channel: "inbox",
					trigger: "membership",
				}),
			],
			["n1"],
		);
	});

	it("does nothing when nothing's pending", async () => {
		const { store, deliver } = adapters([]);
		expect(await drainNotifications(store)).toBe(0);
		expect(deliver).not.toHaveBeenCalled();
	});

	it("runs with the caller's key, refused unless the database takes it as the service role's", async () => {
		const { store } = adapters([]);
		const forKey = (key: string): DrainAdapters =>
			key === "service"
				? store
				: {
						...store,
						pending: async () => {
							throw new DrainForbidden();
						},
					};
		const post = (headers: Record<string, string>) =>
			handleDrainRequest(
				forKey,
				new Request("http://x", { method: "POST", headers }),
			);
		expect((await post({})).status).toBe(403);
		expect((await post({ authorization: "Bearer nope" })).status).toBe(403);
		expect(
			await (await post({ authorization: "Bearer service" })).json(),
		).toEqual({ status: "ok", drained: 0 });
	});
});
