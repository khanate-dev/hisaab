import { isNotificationTrigger, readMembershipPayload } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { ROLE_LABELS } from "@/features/households/labels";
import { formatDateTime } from "@/lib/format";

import { TRIGGER_LABELS } from "./labels";

/** A Notification in the inbox. */
export type InboxItem = {
	id: string;
	trigger: string;
	/** JSON text of what happened. */
	payload: string;
	created_at: string;
};

/** What a Notification says, in the User's words for them: "Bilal joined Family", "You're now Admin in Family". */
const useMessage = (userId: string) => {
	const { t, i18n } = useLingui();
	return ({ trigger, payload }: InboxItem) => {
		const membership =
			trigger === "membership" ? readMembershipPayload(payload) : null;
		if (membership) {
			const { change, householdName: household } = membership;
			const you = membership.userId === userId;
			const name = membership.name ?? t`Someone`;
			const role = i18n._(ROLE_LABELS[membership.role]);
			switch (change) {
				case "joined":
					return you
						? t`You joined ${household}.`
						: t`${name} joined ${household}.`;
				case "left":
					return you
						? t`You left ${household}.`
						: t`${name} left ${household}.`;
				case "removed":
					return you
						? t`You were removed from ${household}.`
						: t`${name} was removed from ${household}.`;
				case "role_changed":
					return you
						? t`You're now ${role} in ${household}.`
						: t`${name} is now ${role} in ${household}.`;
			}
		}
		return isNotificationTrigger(trigger)
			? i18n._(TRIGGER_LABELS[trigger])
			: t`Notification`;
	};
};

/**
 * The Notification inbox (CONTEXT.md): every Notification the User gets, newest first. Those that were new when the
 * User arrived stay marked new while they're here.
 */
export const InboxList = ({
	items,
	userId,
	fresh,
}: {
	items: readonly InboxItem[];
	userId: string;
	/** Ids that were unread when the inbox opened. */
	fresh: ReadonlySet<string>;
}) => {
	const { t } = useLingui();
	const messageOf = useMessage(userId);
	if (items.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Notifications yet.`}
			</Text>
		);
	}
	return (
		<View role="list">
			{items.map((item) => {
				const message = messageOf(item);
				const when = formatDateTime(item.created_at);
				const isNew = fresh.has(item.id);
				return (
					<View
						accessibilityLabel={isNew ? t`New: ${message}` : message}
						accessibilityValue={{ text: when }}
						accessible
						className="min-h-12 gap-0.5 border-b-2 border-border py-2"
						key={item.id}
						role="listitem"
					>
						<Text variant={isNew ? "label" : "body"}>{message}</Text>
						<Text variant="muted">{isNew ? t`New · ${when}` : when}</Text>
					</View>
				);
			})}
		</View>
	);
};
