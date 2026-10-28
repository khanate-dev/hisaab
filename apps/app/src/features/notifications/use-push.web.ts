import { useEffect } from "react";

import { refreshPush } from "@/lib/device/push";

/** Push while signed in: the subscription kept fresh on launch (the service worker shows pushes and opens the inbox). */
export const usePush = () => {
	useEffect(() => {
		void refreshPush().catch(() => {});
	}, []);
};
