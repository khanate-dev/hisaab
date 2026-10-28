/* global self */
// Shows a Web Push (#61) and opens the inbox when it's pressed. The push carries no amounts (pushMessage).
self.addEventListener("push", (event) => {
	const { title = "Hisaab", body = "" } = event.data ? event.data.json() : {};
	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			data: { url: "/inbox" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(
		self.clients.openWindow(event.notification.data?.url ?? "/inbox"),
	);
});
