import { isNotificationTrigger } from "@hisaab/domain";
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
	read_at: string | null;
};

const fields = (payload: string): Record<string, unknown> => {
	try {
		const parsed: unknown = JSON.parse(payload);
		return parsed !== null && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
};
const text = (value: unknown) => (typeof value === "string" ? value : null);

/** What a Notification says, in the User's words for them: "Bilal joined Family", "You're now an Admin of Family". */
const useNotificationText = (userId: string) => {
	const { t, i18n } = useLingui();
	return ({ trigger, payload }: InboxItem) => {
		const p = fields(payload);
		const household = text(p.householdName) ?? t`a household`;
		const you = text(p.userId) === userId;
		const name = text(p.name) ?? t`Someone`;
		const roleKey = text(p.role);
		const role =
			roleKey === "admin" || roleKey === "member" || roleKey === "viewer"
				? i18n._(ROLE_LABELS[roleKey])
				: t`another Role`;
		if (trigger === "membership")
			switch (text(p.change)) {
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
				default:
					return t`Membership changed in ${household}.`;
			}
		const label = isNotificationTrigger(trigger)
			? i18n._(TRIGGER_LABELS[trigger])
			: t`Notification`;
		return t`${label} in ${household}.`;
	};
};

/** The Notification inbox (CONTEXT.md): every Notification the User gets, newest first, unread ones marked. */
export const InboxList = ({
	items,
	userId,
}: {
	items: readonly InboxItem[];
	userId: string;
}) => {
	const { t } = useLingui();
	const say = useNotificationText(userId);
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
				const message = say(item);
				const when = formatDateTime(item.created_at);
				const unread = item.read_at === null;
				return (
					<View
						accessibilityLabel={unread ? t`New: ${message}` : message}
						accessibilityValue={{ text: when }}
						accessible
						className="min-h-12 gap-0.5 border-b-2 border-border py-2"
						key={item.id}
						role="listitem"
					>
						<Text variant={unread ? "label" : "body"}>{message}</Text>
						<Text variant="muted">{unread ? t`New · ${when}` : when}</Text>
					</View>
				);
			})}
		</View>
	);
};
