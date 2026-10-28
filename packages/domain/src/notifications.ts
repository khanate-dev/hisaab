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

/**
 * Whether a trigger reaches a User by push: their own choice, else their Role's default. Someone no longer in the
 * household (`role` null: they just left or were removed) hears only about that. Never the inbox's say. As
 * `private.push_on` in the database.
 */
export const isOn = (
	trigger: NotificationTrigger,
	role: MemberRole | null,
	choice: { enabled: boolean } | undefined,
) =>
	role === null
		? trigger === "membership"
		: (choice?.enabled ?? defaultOn(trigger, role));

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

/** What an event Notification (#62) says happened: a Recurring rule due or recorded, a Budget passed, a Loan due. */
export type EventPayload =
	| {
			trigger: "recurring_due";
			householdName: string;
			ruleId: string;
			/** The rule's description, else its Category's name: for the inbox only, as it may hold a figure. */
			ruleName: string;
			/** Its Category's name, which push names it by. */
			categoryName: string;
			dueOn: string;
			/** Still Pending 3 days on. */
			reminder: boolean;
	  }
	| {
			trigger: "auto_recorded";
			householdName: string;
			ruleId: string;
			/** The rule's description, else its Category's name: for the inbox only, as it may hold a figure. */
			ruleName: string;
			/** Its Category's name, which push names it by. */
			categoryName: string;
			dueOn: string;
	  }
	| {
			trigger: "budget_threshold";
			householdName: string;
			categoryId: string;
			categoryName: string;
			month: string;
			level: 80 | 100;
	  }
	| {
			trigger: "loan_due";
			householdName: string;
			loanId: string;
			contactName: string;
			direction: "lent" | "borrowed";
			dueOn: string;
			when: "soon" | "today" | "overdue";
	  };

const LOAN_WHEN: readonly string[] = ["soon", "today", "overdue"];

/** An event Notification's payload, as `scheduledNotifications` writes it, or null when it's malformed. */
export const readEventPayload = (
	trigger: string,
	json: string,
): EventPayload | null => {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object") return null;
	const p = raw as Record<string, unknown>;
	const text = (key: string) => (typeof p[key] === "string" ? p[key] : null);
	const householdName = text("householdName");
	if (householdName === null) return null;
	const ruleId = text("ruleId");
	const ruleName = text("ruleName");
	const categoryName = text("categoryName");
	const dueOn = text("dueOn");
	switch (trigger) {
		case "recurring_due":
			return ruleId !== null &&
				ruleName !== null &&
				categoryName !== null &&
				dueOn !== null &&
				typeof p.reminder === "boolean"
				? {
						trigger,
						householdName,
						ruleId,
						ruleName,
						categoryName,
						dueOn,
						reminder: p.reminder,
					}
				: null;
		case "auto_recorded":
			return ruleId !== null &&
				ruleName !== null &&
				categoryName !== null &&
				dueOn !== null
				? { trigger, householdName, ruleId, ruleName, categoryName, dueOn }
				: null;
		case "budget_threshold": {
			const categoryId = text("categoryId");
			const month = text("month");
			const { level } = p;
			return categoryId !== null &&
				categoryName !== null &&
				month !== null &&
				(level === 80 || level === 100)
				? { trigger, householdName, categoryId, categoryName, month, level }
				: null;
		}
		case "loan_due": {
			const loanId = text("loanId");
			const contactName = text("contactName");
			const { direction, when } = p;
			return loanId !== null &&
				contactName !== null &&
				dueOn !== null &&
				(direction === "lent" || direction === "borrowed") &&
				typeof when === "string" &&
				LOAN_WHEN.includes(when)
				? {
						trigger,
						householdName,
						loanId,
						contactName,
						direction,
						dueOn,
						when: when as "soon" | "today" | "overdue",
					}
				: null;
		}
		default:
			return null;
	}
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
	/** `ticket`: Expo's, to fetch its receipt by on a later run. */
	| { status: "sent"; ticket?: string }
	| { status: "failed"; error: string }
	| { status: "dead"; error: string; gone?: boolean };

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
			ticket: string | null;
		}[],
	) => Promise<void>;
	/** Forgets targets that are gone for good, so nothing is sent to them again. */
	forget: (targets: string[]) => Promise<void>;
	/** Sent Expo deliveries whose receipt should be in by now, at most `limit`. */
	receiptsDue: (
		limit: number,
	) => Promise<{ id: string; target: string; ticket: string }[]>;
	/** Records what each receipt said; an error makes the delivery dead. */
	settleReceipts: (
		results: { id: string; error: string | null }[],
	) => Promise<void>;
};

/** One Expo push receipt: whether the message reached APNs or FCM. */
export type ExpoReceipt =
	| { status: "ok" }
	| { status: "error"; message?: string; details?: { error?: string } };

/** Fetches Expo's receipts for tickets; a ticket with none yet is missing from the answer. */
export type ReceiptFetcher = (
	tickets: string[],
) => Promise<Record<string, ExpoReceipt>>;

/** How many deliveries one run takes, and how many tries a delivery gets (#13: five, with backoff). */
export const DISPATCH_BATCH = 100;
export const MAX_ATTEMPTS = 5;

/** Sends what's due once. A channel with no sender yet fails the delivery, which then retries until it's dead. */
export const dispatchDeliveries = async (
	adapters: DispatchAdapters,
	senders: Partial<Record<DeliveryChannel, Sender>>,
	fetchReceipts?: ReceiptFetcher,
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
				target: delivery.target,
				status,
				error: "error" in outcome ? outcome.error : null,
				ticket: outcome.status === "sent" ? (outcome.ticket ?? null) : null,
				gone: outcome.status === "dead" && outcome.gone === true,
			};
		}),
	);
	if (results.length > 0)
		await adapters.settle(
			results.map(({ id, status, error, ticket }) => ({
				id,
				status,
				error,
				ticket,
			})),
		);
	const gone = results.flatMap((r) => (r.gone ? [r.target] : []));
	if (fetchReceipts)
		gone.push(...(await checkReceipts(adapters, fetchReceipts)));
	if (gone.length > 0) await adapters.forget([...new Set(gone)]);
	return results.length;
};

/** How many Expo receipts one run asks for (Expo takes up to 1,000 ids a request). */
export const RECEIPT_BATCH = 300;

/** What an Expo receipt says: delivered, or an error; an unregistered device's token is gone. */
export const expoReceiptOutcome = (
	receipt: ExpoReceipt,
): { error: string | null; gone: boolean } =>
	receipt.status === "ok"
		? { error: null, gone: false }
		: {
				error: receipt.details?.error ?? receipt.message ?? "Expo error",
				gone: receipt.details?.error === "DeviceNotRegistered",
			};

/**
 * Settles the receipts that are in for sent Expo deliveries (#13: tickets say Expo took a message, receipts whether it
 * reached the device). One with no receipt yet waits for a later run. Answers with the targets found gone.
 */
const checkReceipts = async (
	adapters: DispatchAdapters,
	fetchReceipts: ReceiptFetcher,
) => {
	const due = await adapters.receiptsDue(RECEIPT_BATCH);
	if (due.length === 0) return [];
	const receipts = await fetchReceipts(due.map((d) => d.ticket));
	const settled = due.flatMap((d) => {
		const receipt = receipts[d.ticket];
		return receipt ? [{ ...d, ...expoReceiptOutcome(receipt) }] : [];
	});
	if (settled.length > 0)
		await adapters.settleReceipts(
			settled.map(({ id, error }) => ({ id, error })),
		);
	return settled.flatMap((r) => (r.gone ? [r.target] : []));
};

/**
 * Whether a key could be the service role's, before asking the database: a secret key, or a JWT whose role claim says
 * so. A publishable key, a User's session or anything else is turned away without spending a database call.
 */
export const mayBeServiceKey = (key: string) => {
	if (key.startsWith("sb_secret_")) return true;
	const [, body] = key.split(".");
	if (!body) return false;
	try {
		const claims = JSON.parse(
			atob(body.replaceAll("-", "+").replaceAll("_", "/")),
		) as { role?: unknown };
		return claims.role === "service_role";
	} catch {
		return false;
	}
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
	fetchReceipts?: ReceiptFetcher,
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
			settled: await dispatchDeliveries(
				adaptersFor(key),
				senders,
				fetchReceipts,
			),
		});
	} catch (error) {
		if (error instanceof DispatchForbidden)
			return Response.json({ status: "forbidden" }, { status: 403 });
		throw error;
	}
};

const TRIGGER_TITLES: Record<NotificationTrigger, string> = {
	recurring_due: "Recurring due",
	auto_recorded: "Auto-recorded",
	budget_threshold: "Budget threshold",
	loan_due: "Loan due",
	household_activity: "Household activity",
	membership: "Membership",
	monthly_summary: "Monthly summary",
};

/**
 * What a push says (#13: server templates by trigger; English only at launch). Made only from the names of who and
 * where, never from anything else in the payload, so no amount ever reaches a lock screen or a push relay.
 */
export const pushMessage = (
	trigger: NotificationTrigger,
	payload: string,
): { title: string; body: string } => {
	const membership =
		trigger === "membership" ? readMembershipPayload(payload) : null;
	if (membership) {
		const name = membership.name ?? "Someone";
		const where = membership.householdName;
		const body = {
			joined: `${name} joined ${where}.`,
			left: `${name} left ${where}.`,
			removed: `${name} was removed from ${where}.`,
			role_changed: `${name} is now ${ROLE_NAMES[membership.role]} in ${where}.`,
		}[membership.change];
		return { title: "Hisaab", body };
	}
	const event = readEventPayload(trigger, payload);
	if (event) return { title: TRIGGER_TITLES[trigger], body: eventBody(event) };
	let household: string | null = null;
	try {
		const raw: unknown = JSON.parse(payload);
		if (
			raw !== null &&
			typeof raw === "object" &&
			typeof (raw as { householdName?: unknown }).householdName === "string"
		)
			household = (raw as { householdName: string }).householdName;
	} catch {
		household = null;
	}
	return {
		title: TRIGGER_TITLES[trigger],
		body: household === null ? "Open Hisaab to see it." : `In ${household}.`,
	};
};

/**
 * An event push's body, from names alone: a Recurring rule by its Category's name, never its description, which is
 * free text and may hold a figure.
 */
const eventBody = (event: EventPayload) => {
	const where = event.householdName;
	switch (event.trigger) {
		case "recurring_due":
			return event.reminder
				? `${event.categoryName} is still Pending in ${where}.`
				: `${event.categoryName} is due in ${where}.`;
		case "auto_recorded":
			return `${event.categoryName} was recorded in ${where}.`;
		case "budget_threshold":
			return event.level === 100
				? `${event.categoryName} has used its Budget in ${where}.`
				: `${event.categoryName} is close to its Budget in ${where}.`;
		case "loan_due": {
			const loan =
				event.direction === "lent"
					? `The Loan to ${event.contactName}`
					: `The Loan from ${event.contactName}`;
			return {
				soon: `${loan} is due soon, in ${where}.`,
				today: `${loan} is due today, in ${where}.`,
				overdue: `${loan} is overdue, in ${where}.`,
			}[event.when];
		}
	}
};

const ROLE_NAMES: Record<MemberRole, string> = {
	admin: "an Admin",
	member: "a Member",
	viewer: "a Viewer",
};

/** One Expo push ticket, as the Expo Push Service answers each message. */
export type ExpoTicket =
	| { status: "ok"; id?: string }
	| { status: "error"; message?: string; details?: { error?: string } };

/** What an Expo ticket says about sending: an unregistered device's token is gone; other errors are retried. */
export const expoOutcome = (ticket: ExpoTicket | undefined): SendOutcome => {
	if (!ticket) return { status: "failed", error: "No ticket from Expo" };
	if (ticket.status === "ok")
		return ticket.id === undefined
			? { status: "sent" }
			: { status: "sent", ticket: ticket.id };
	const error = ticket.details?.error ?? ticket.message ?? "Expo error";
	return ticket.details?.error === "DeviceNotRegistered"
		? { status: "dead", error, gone: true }
		: { status: "failed", error };
};

/** What a Web Push service's answer says: 404 and 410 mean the subscription is gone; 2xx sent; anything else retried. */
export const webPushOutcome = (status: number): SendOutcome =>
	status >= 200 && status < 300
		? { status: "sent" }
		: status === 404 || status === 410
			? { status: "dead", error: `Subscription gone (${status})`, gone: true }
			: { status: "failed", error: `Push service answered ${status}` };
