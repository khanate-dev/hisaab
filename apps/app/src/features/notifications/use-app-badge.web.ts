import { useEffect } from "react";

import { useUnreadCount } from "./use-notifications";

/** The installed web app's badge: how many Notifications are unread, cleared as the inbox is read (where supported). */
export const useAppBadge = (userId: string) => {
	const unread = useUnreadCount(userId);
	useEffect(() => {
		if (!("setAppBadge" in navigator)) return;
		void (
			unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()
		).catch(() => {});
	}, [unread]);
	// Signed out (the tabs go): no count left on the badge.
	useEffect(
		() => () => {
			if ("clearAppBadge" in navigator)
				void navigator.clearAppBadge().catch(() => {});
		},
		[],
	);
};
