import { useEffect } from "react";

import { useUnreadCount } from "./use-notifications";

/** The installed web app's badge: how many Notifications are unread, cleared as the inbox is read (where supported). */
export const useAppBadge = (userId: string) => {
	const unread = useUnreadCount(userId);
	useEffect(() => {
		if (unread === undefined || !("setAppBadge" in navigator)) return;
		void (
			unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()
		).catch(() => {});
	}, [unread]);
};
