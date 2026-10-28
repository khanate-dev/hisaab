import { setBadgeCountAsync } from "expo-notifications";
import { useEffect } from "react";

import { useUnreadCount } from "./use-notifications";

/** The app icon's badge: how many Notifications are unread, cleared as the inbox is read. */
export const useAppBadge = (userId: string) => {
	const unread = useUnreadCount(userId);
	useEffect(() => {
		if (unread !== undefined) void setBadgeCountAsync(unread).catch(() => {});
	}, [unread]);
};
