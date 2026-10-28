import { env } from "../env";

import { deviceRegistered, registerDevice } from "./push-registration";

/** The service worker that shows a push (public/push-sw.js). */
const WORKER = "/push-sw.js";

const keyBytes = (base64Url: string) => {
	const base64 = base64Url
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

/** Whether this browser can push here: a service worker, the Push API, and the app's VAPID key. */
export const pushAvailable = async () =>
	env.vapidPublicKey !== null &&
	"serviceWorker" in navigator &&
	"PushManager" in window;

/** Whether the browser has blocked notifications for the app. */
export const pushBlocked = async () =>
	"Notification" in window && Notification.permission === "denied";

const register = (subscription: PushSubscription) =>
	registerDevice({
		platform: "web",
		kind: "webpush",
		token: JSON.stringify(subscription),
	});

/** Asks for permission (only from a press, in context) and registers this browser's Web Push subscription. */
export const turnOnPush = async (): Promise<"on" | "denied"> => {
	if (!(await pushAvailable()) || env.vapidPublicKey === null) return "denied";
	if ((await Notification.requestPermission()) !== "granted") return "denied";
	await navigator.serviceWorker.register(WORKER);
	// Subscribing needs the worker active, not just installed.
	const worker = await navigator.serviceWorker.ready;
	await register(
		await worker.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: keyBytes(env.vapidPublicKey),
		}),
	);
	return "on";
};

/** On launch, where push is on (turned on here and still allowed): registers the subscription again, as the browser may have renewed it. */
export const refreshPush = async () => {
	if (!(await pushAvailable()) || Notification.permission !== "granted") return;
	if (!(await deviceRegistered())) return;
	const worker = await navigator.serviceWorker.getRegistration(WORKER);
	const subscription = await worker?.pushManager.getSubscription();
	if (subscription) await register(subscription);
};
