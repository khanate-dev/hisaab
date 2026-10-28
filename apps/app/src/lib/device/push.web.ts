import { env } from "../env";

import { registerDevice } from "./push-registration";

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

/** Asks for permission (only from a press, in context) and registers this browser's Web Push subscription. */
export const turnOnPush = async (userId: string): Promise<"on" | "denied"> => {
	if (!(await pushAvailable()) || env.vapidPublicKey === null) return "denied";
	if ((await Notification.requestPermission()) !== "granted") return "denied";
	const worker = await navigator.serviceWorker.register(WORKER);
	const subscription = await worker.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: keyBytes(env.vapidPublicKey),
	});
	await registerDevice(userId, {
		platform: "web",
		kind: "webpush",
		token: JSON.stringify(subscription),
	});
	return "on";
};
