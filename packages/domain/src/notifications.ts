// Notifications (spec §3.5; issues #9 and #13). A trigger raises a Notification as inbox rows, one per recipient: the
// Notification inbox always receives everything. Push and email (Delivery channels) go through an outbox of
// deliveries, one per target, which the `dispatch-notifications` Edge Function sends every minute, retrying with
// backoff. Preferences, per User × household × trigger over defaults by Role, choose which triggers also come by push.
// No imports: the dispatch Edge Function loads this file in Deno.

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

export const isNotificationTrigger = (
	value: string,
): value is NotificationTrigger =>
	NOTIFICATION_TRIGGERS.some((t) => t === value);

/** A Member's Role, as `ROLES` in ./invites has it (that file is imported by neither, both being Deno-loaded). */
export type MemberRole = "admin" | "member" | "viewer";

const ROLE_VALUES: readonly string[] = ["admin", "member", "viewer"];
const isMemberRole = (value: unknown): value is MemberRole =>
	typeof value === "string" && ROLE_VALUES.includes(value);

/**
 * Whether a trigger reaches a Role by push when the User hasn't said (issue #9's table): Viewers get only the Monthly
 * summary, and the Household activity digest is opt-in for everyone.
 */
export const defaultOn = (trigger: NotificationTrigger, role: MemberRole) => {
	if (trigger === "household_activity") return false;
	if (role === "viewer") return trigger === "monthly_summary";
	return true;
};

/** Whether a trigger reaches a User by push: their own choice, else their Role's default. Never the inbox's say. */
export const isOn = (
	trigger: NotificationTrigger,
	role: MemberRole,
	choice: { enabled: boolean } | undefined,
) => choice?.enabled ?? defaultOn(trigger, role);

/** What a Membership Notification says happened. */
export type MembershipChange = "joined" | "left" | "removed" | "role_changed";
const CHANGES: readonly string[] = [
	"joined",
	"left",
	"removed",
	"role_changed",
];

export type MembershipPayload = {
	change: MembershipChange;
	/** Whom it's about. */
	userId: string;
	/** Their display name when it was raised; null if they had none yet. */
	name: string | null;
	role: MemberRole;
	householdName: string;
};

/** A Membership Notification's payload, or null when it's malformed (an inbox row never breaks the inbox). */
export const readMembershipPayload = (
	json: string,
): MembershipPayload | null => {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object") return null;
	const { change, userId, name, role, householdName } = raw as Record<
		string,
		unknown
	>;
	if (typeof change !== "string" || !CHANGES.includes(change)) return null;
	if (
		typeof userId !== "string" ||
		typeof householdName !== "string" ||
		!isMemberRole(role)
	)
		return null;
	return {
		change: change as MembershipChange,
		userId,
		name: typeof name === "string" ? name : null,
		role,
		householdName,
	};
};

export const DELIVERY_CHANNELS = ["expo", "webpush", "email"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** A delivery the dispatcher has claimed: its attempt is counted already. */
export type ClaimedDelivery = {
	id: string;
	notificationId: string;
	userId: string;
	channel: DeliveryChannel;
	/** The Expo token, Web Push subscription or email address. */
	target: string;
	/** Including this one. */
	attempts: number;
	trigger: NotificationTrigger;
	payload: string;
};

/** How sending went: sent; failed (try again later); or dead (the target is gone, say a 410 or an expired token). */
export type SendOutcome =
	{ status: "sent" } | { status: "failed" | "dead"; error: string };

/** Sends one delivery through its channel. Push (8.2) and email (the Monthly summary) bring theirs. */
export type Sender = (delivery: ClaimedDelivery) => Promise<SendOutcome>;

/** What the dispatcher needs from the database, as the service role. */
export type DispatchAdapters = {
	/** Due deliveries, locked against other runs, their attempt counted; at most `limit`. */
	claim: (limit: number) => Promise<ClaimedDelivery[]>;
	settle: (
		results: {
			id: string;
			status: "sent" | "failed" | "dead";
			error: string | null;
		}[],
	) => Promise<void>;
};

/** How many deliveries one run takes, and how many tries a delivery gets (#13: five, with backoff). */
export const DISPATCH_BATCH = 100;
export const MAX_ATTEMPTS = 5;

/** Sends what's due once. A channel with no sender yet fails the delivery, which then retries until it's dead. */
export const dispatchDeliveries = async (
	adapters: DispatchAdapters,
	senders: Partial<Record<DeliveryChannel, Sender>>,
) => {
	const claimed = await adapters.claim(DISPATCH_BATCH);
	const results = await Promise.all(
		claimed.map(async (delivery) => {
			const send = senders[delivery.channel];
			const outcome: SendOutcome = send
				? await send(delivery).catch((error: unknown) => ({
						status: "failed" as const,
						error: error instanceof Error ? error.message : String(error),
					}))
				: { status: "failed", error: `No sender for ${delivery.channel} yet` };
			const status =
				outcome.status === "failed" && delivery.attempts >= MAX_ATTEMPTS
					? "dead"
					: outcome.status;
			return {
				id: delivery.id,
				status,
				error: "error" in outcome ? outcome.error : null,
			};
		}),
	);
	if (results.length > 0) await adapters.settle(results);
	return results.length;
};

/** The database refused the caller: they aren't the service role. */
export class DispatchForbidden extends Error {}

/**
 * The dispatch Edge Function's request handling. It runs with the caller's own key, and only the service role may
 * claim deliveries, so anyone else is refused there (pg_cron calls it with the service role's key). Answers with how
 * many deliveries it settled.
 */
export const handleDispatchRequest = async (
	adaptersFor: (key: string) => DispatchAdapters,
	senders: Partial<Record<DeliveryChannel, Sender>>,
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
			settled: await dispatchDeliveries(adaptersFor(key), senders),
		});
	} catch (error) {
		if (error instanceof DispatchForbidden)
			return Response.json({ status: "forbidden" }, { status: 403 });
		throw error;
	}
};
