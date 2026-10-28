import { useLingui } from "@lingui/react/macro";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { markRead } from "@/features/notifications/actions";
import { InboxList } from "@/features/notifications/inbox-list";
import { useInbox } from "@/features/notifications/use-notifications";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function Inbox() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const items = useInbox(userId);
	// What was unread while the inbox was on screen: shown as new here, marked read once the User leaves.
	const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
	const seen = useRef(new Set<string>());
	const unread =
		items?.filter((i) => i.read_at === null).map((i) => i.id) ?? [];
	const unreadKey = unread.join(",");

	useFocusEffect(
		useCallback(() => {
			for (const id of unreadKey === "" ? [] : unreadKey.split(","))
				seen.current.add(id);
			setFresh(new Set(seen.current));
			return () => {
				const shown = [...seen.current];
				seen.current = new Set();
				void markRead(shown);
			};
		}, [unreadKey]),
	);

	return (
		<Screen title={t`Notifications`}>
			<Button
				onPress={() => router.push("/notification-preferences")}
				variant="secondary"
			>
				{t`Notification preferences`}
			</Button>
			{items !== undefined && (
				<InboxList
					fresh={fresh}
					items={items}
					userId={userId}
				/>
			)}
		</Screen>
	);
}
