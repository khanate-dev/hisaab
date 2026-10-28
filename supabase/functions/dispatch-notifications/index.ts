// Notifications (spec §3.5; issue #13): sends what's due in the push and email outbox, every minute (pg_cron calls this
// with the service role's key). The logic is in packages/domain behind adapters (ADR-0010); this wires them to
// PostgREST, and sends through Expo Push (mobile) and VAPID Web Push (web); email arrives with the Monthly summary.
import {
	type ClaimedDelivery,
	type DispatchAdapters,
	DispatchForbidden,
	type ExpoReceipt,
	type BatchSender,
	EXPO_BATCH,
	type ExpoTicket,
	expoOutcome,
	expoOutcomes,
	handleDispatchRequest,
	pushMessage,
	type ReceiptFetcher,
	type Sender,
	type SendOutcome,
	webPushOutcome,
} from "../../../packages/domain/src/notifications.ts";

const url = Deno.env.get("SUPABASE_URL");
if (!url) throw new Error("SUPABASE_URL must be set");

type ClaimedRow = {
	id: string;
	notification_id: string;
	user_id: string;
	channel: ClaimedDelivery["channel"];
	target: string;
	attempts: number;
	trigger: ClaimedDelivery["trigger"];
	payload: string;
};

/**
 * The adapters, calling PostgREST with the caller's own key: only the service role may claim and settle deliveries,
 * so anyone else is refused by the database itself.
 */
const adaptersFor = (key: string): DispatchAdapters => {
	const rpc = async (name: string, args: unknown) => {
		const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
			method: "POST",
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(args),
		});
		// 426: the contract version gate, which lets only the service role through without the app's header.
		if (
			response.status === 401 ||
			response.status === 403 ||
			response.status === 426
		)
			throw new DispatchForbidden();
		if (!response.ok)
			throw new Error(
				`PostgREST rpc/${name} answered ${response.status}: ${await response.text()}`,
			);
		const text = await response.text();
		return text === "" ? null : JSON.parse(text);
	};
	return {
		claim: async (limit) =>
			((await rpc("claim_deliveries", { batch: limit })) as ClaimedRow[]).map(
				(row) => ({
					id: row.id,
					notificationId: row.notification_id,
					userId: row.user_id,
					channel: row.channel,
					target: row.target,
					attempts: row.attempts,
					trigger: row.trigger,
					payload: row.payload,
				}),
			),
		settle: async (results) => {
			await rpc("settle_deliveries", { results });
		},
		forget: async (targets) => {
			await rpc("forget_push_targets", { targets });
		},
		receiptsDue: async (limit) =>
			(
				(await rpc("expo_receipts_due", { batch: limit })) as {
					id: string;
					target: string;
					ticket_id: string;
				}[]
			).map((row) => ({
				id: row.id,
				target: row.target,
				ticket: row.ticket_id,
			})),
		settleReceipts: async (results) => {
			await rpc("settle_receipts", { results });
		},
	};
};

const EXPO_SEND = "https://exp.host/--/api/v2/push/send";

const expoMessage = (delivery: ClaimedDelivery) => {
	const { title, body } = pushMessage(delivery.trigger, delivery.payload);
	return {
		to: delivery.target,
		title,
		body,
		data: { notificationId: delivery.notificationId },
	};
};

const postToExpo = (messages: unknown) =>
	fetch(EXPO_SEND, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify(messages),
	});

/** One message on its own: what a batch Expo refused whole falls back to, so one bad token fails only itself. */
const expoOne = async (delivery: ClaimedDelivery): Promise<SendOutcome> => {
	const response = await postToExpo(expoMessage(delivery));
	if (!response.ok)
		return { status: "failed", error: `Expo answered ${response.status}` };
	const { data } = (await response.json()) as { data?: ExpoTicket };
	return expoOutcome(data);
};

/**
 * Mobile push through the Expo Push Service, which holds the APNs and FCM credentials (#13): up to 100 a request, a
 * ticket back for each in order. A batch refused whole (a 400, say tokens of two projects) goes again one at a time.
 */
const expo: BatchSender = {
	size: EXPO_BATCH,
	send: async (deliveries) => {
		const response = await postToExpo(deliveries.map(expoMessage));
		if (response.status === 400) return Promise.all(deliveries.map(expoOne));
		if (!response.ok)
			return deliveries.map(() => ({
				status: "failed" as const,
				error: `Expo answered ${response.status}`,
			}));
		const { data } = (await response.json()) as { data?: unknown };
		return expoOutcomes(data, deliveries.length);
	},
};

/** Expo's receipts for its tickets: whether each message reached APNs or FCM. */
const expoReceipts: ReceiptFetcher = async (tickets) => {
	const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify({ ids: tickets }),
	});
	if (!response.ok) return {};
	const { data } = (await response.json()) as {
		data?: Record<string, ExpoReceipt>;
	};
	return data ?? {};
};

/** Web push with VAPID (keys in the Edge Function's secrets; #30 adds them). Without them it waits and retries. */
const webpush: Sender = async (delivery) => {
	const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
	const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
	const subject = Deno.env.get("VAPID_SUBJECT");
	if (!publicKey || !privateKey || !subject)
		return { status: "failed", error: "Web Push isn't set up yet" };
	const { default: client } = await import("web-push");
	try {
		const result = await client.sendNotification(
			JSON.parse(delivery.target),
			JSON.stringify({
				...pushMessage(delivery.trigger, delivery.payload),
				notificationId: delivery.notificationId,
			}),
			{ vapidDetails: { subject, publicKey, privateKey } },
		);
		return webPushOutcome(result.statusCode);
	} catch (error) {
		const status = (error as { statusCode?: number }).statusCode;
		return status === undefined
			? { status: "failed", error: String(error) }
			: webPushOutcome(status);
	}
};

Deno.serve((request) =>
	handleDispatchRequest(adaptersFor, { expo, webpush }, request, expoReceipts),
);
