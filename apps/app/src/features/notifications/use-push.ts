import {
	addNotificationResponseReceivedListener,
	setNotificationHandler,
} from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";

import { refreshPush } from "@/lib/device/push";

// A push that lands while the app is open still shows, as it would in the background.
setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: false,
		shouldSetBadge: false,
	}),
});

/** Push while signed in: the token kept fresh on launch, and a pressed push opens the Notification inbox. */
export const usePush = () => {
	useEffect(() => {
		void refreshPush().catch(() => {});
		const pressed = addNotificationResponseReceivedListener(() =>
			router.push("/inbox"),
		);
		return () => pressed.remove();
	}, []);
};
