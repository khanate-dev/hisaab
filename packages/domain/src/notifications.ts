// Notifications (spec §3.5, issue #9): a trigger raises a Notification in a household; an outbox drained every minute
// fans it out to its recipients. The Notification inbox always receives every Notification a User gets; other
// Delivery channels (push, email) join later. Preferences are per User, per household, per trigger, over defaults.
// No imports: the drain Edge Function loads this file in Deno.

export const NOTIFICATION_TRIGGERS = [
	"recurring_due",
	"auto_recorded",
	"budget_threshold",
	"loan_due",
	"household_activity",
	"membership",
	"monthly_summary",
] as const;
export type NotificationTrigger = (typeof NOTIFICATION_TRIGGERS)[number];

export type MemberRole = "admin" | "member" | "viewer";

/**
 * Whether a trigger is on for a Role when the User hasn't said (issue #9's table): Viewers get only the Monthly
 * summary; the Household activity digest is opt-in for everyone.
 */
export const defaultOn = (trigger: NotificationTrigger, role: MemberRole) => {
	if (trigger === "household_activity") return false;
	if (role === "viewer") return trigger === "monthly_summary";
	return true;
};

/** A User's own choice for a trigger in a household. */
export type NotificationPreference = {
	user_id: string;
	trigger: string;
	enabled: boolean;
	created_at: string;
};

/** Whether a trigger is on for a User: their latest choice, else the default for their Role. */
export const isOn = (
	trigger: NotificationTrigger,
	member: { userId: string; role: MemberRole },
	preferences: readonly NotificationPreference[],
) => {
	const latest = preferences
		.filter((p) => p.user_id === member.userId && p.trigger === trigger)
		.reduce<NotificationPreference | undefined>(
			(last, p) => (!last || p.created_at > last.created_at ? p : last),
			undefined,
		);
	return latest ? latest.enabled : defaultOn(trigger, member.role);
};

/** What a Membership Notification says happened. */
export type MembershipChange = "joined" | "left" | "removed" | "role_changed";

/** A raised Notification, as the outbox keeps it. */
export type OutboxNotification = {
	id: string;
	householdId: string;
	trigger: NotificationTrigger;
	/** Whom it's about, when it's about someone: the person who joined, left, was removed or changed Role. */
	subjectUserId: string | null;
	/** JSON text the inbox reads: what happened, never an amount (push text must not carry one). */
	payload: string;
};

/** Who a Notification is for, before preferences: by trigger (issue #9's table). */
const candidates = (
	notification: OutboxNotification,
	members: readonly { userId: string; role: MemberRole }[],
) => {
	switch (notification.trigger) {
		case "membership":
			// Admins, plus the affected person (who may have just left, so isn't a member any more).
			return [
				...members.filter(
					(m) => m.role === "admin" || m.userId === notification.subjectUserId,
				),
				...(notification.subjectUserId !== null &&
				!members.some((m) => m.userId === notification.subjectUserId)
					? [{ userId: notification.subjectUserId, role: "member" as const }]
					: []),
			];
		case "budget_threshold":
		case "loan_due":
			return members.filter((m) => m.role !== "viewer");
		default:
			return [...members];
	}
};

/** The Users a Notification reaches: its trigger's recipients for whom it's on. */
export const recipients = (
	notification: OutboxNotification,
	members: readonly { userId: string; role: MemberRole }[],
	preferences: readonly NotificationPreference[],
) => [
	...new Set(
		candidates(notification, members)
			.filter((m) => isOn(notification.trigger, m, preferences))
			.map((m) => m.userId),
	),
];

/** One Notification reaching one User through one channel; the inbox's rows. */
export type Delivery = {
	notificationId: string;
	householdId: string;
	userId: string;
	channel: "inbox";
	trigger: NotificationTrigger;
	payload: string;
};

/** What the drain needs from the database, as the service role. */
export type DrainAdapters = {
	/** Undrained Notifications, oldest first, at most `limit`. */
	pending: (limit: number) => Promise<OutboxNotification[]>;
	members: (
		householdId: string,
	) => Promise<{ userId: string; role: MemberRole }[]>;
	preferences: (householdId: string) => Promise<NotificationPreference[]>;
	/** Writes the deliveries and marks the Notifications drained, together. */
	deliver: (deliveries: Delivery[], drainedIds: string[]) => Promise<void>;
};

/** How many Notifications one run takes; the next minute takes the rest. */
export const DRAIN_BATCH = 200;

/** Drains the outbox once: every pending Notification reaches its recipients' inboxes. Returns how many it drained. */
export const drainNotifications = async (adapters: DrainAdapters) => {
	const pending = await adapters.pending(DRAIN_BATCH);
	const byHousehold = new Map<string, OutboxNotification[]>();
	for (const n of pending)
		byHousehold.set(n.householdId, [
			...(byHousehold.get(n.householdId) ?? []),
			n,
		]);
	const deliveries: Delivery[] = [];
	for (const [householdId, notifications] of byHousehold) {
		const [members, preferences] = await Promise.all([
			adapters.members(householdId),
			adapters.preferences(householdId),
		]);
		for (const n of notifications)
			for (const userId of recipients(n, members, preferences))
				deliveries.push({
					notificationId: n.id,
					householdId,
					userId,
					channel: "inbox",
					trigger: n.trigger,
					payload: n.payload,
				});
	}
	if (pending.length > 0)
		await adapters.deliver(
			deliveries,
			pending.map((n) => n.id),
		);
	return pending.length;
};

/** The database refused the caller: they aren't the service role. */
export class DrainForbidden extends Error {}

/**
 * The drain Edge Function's request handling. It runs with the caller's own key, and only the service role may read
 * the outbox, so anyone else is refused there (pg_cron calls it with the service role's key). Answers with how many
 * Notifications it drained.
 */
export const handleDrainRequest = async (
	adaptersFor: (key: string) => DrainAdapters,
	request: Request,
): Promise<Response> => {
	if (request.method !== "POST")
		return Response.json({ status: "method_not_allowed" }, { status: 405 });
	const key = /^Bearer (.+)$/.exec(
		request.headers.get("authorization") ?? "",
	)?.[1];
	if (!key) return Response.json({ status: "forbidden" }, { status: 403 });
	try {
		return Response.json({
			status: "ok",
			drained: await drainNotifications(adaptersFor(key)),
		});
	} catch (error) {
		if (error instanceof DrainForbidden)
			return Response.json({ status: "forbidden" }, { status: 403 });
		throw error;
	}
};
