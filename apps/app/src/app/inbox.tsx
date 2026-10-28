import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useEffect } from "react";

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
	const unread = items
		?.filter((i) => i.read_at === null)
		.map((i) => i.id)
		.join(",");

	// What's been shown is read; they're still marked new until the next look.
	useEffect(() => {
		if (unread) void markRead(unread.split(","));
	}, [unread]);

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
					items={items}
					userId={userId}
				/>
			)}
		</Screen>
	);
}
