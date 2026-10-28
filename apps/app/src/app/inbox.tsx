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
	// What was unread while the inbox was on screen: shown as new here, and marked read only once the User leaves,
	// so a Notification arriving meanwhile is seen as new too.
	const [focused, setFocused] = useState(false);
	const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
	const seen = useRef(new Set<string>());
	const unreadKey = (items ?? [])
		.filter((i) => i.read_at === null)
		.map((i) => i.id)
		.join(",");

	useFocusEffect(
		useCallback(() => {
			setFocused(true);
			return () => {
				setFocused(false);
				const shown = [...seen.current];
				seen.current = new Set();
				setFresh(new Set());
				void markRead(shown);
			};
		}, []),
	);
	useEffect(() => {
		if (!focused || unreadKey === "") return;
		for (const id of unreadKey.split(",")) seen.current.add(id);
		setFresh(new Set(seen.current));
	}, [focused, unreadKey]);

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
