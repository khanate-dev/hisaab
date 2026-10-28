import {
	type EventPayload,
	isNotificationTrigger,
	readEventPayload,
	readMembershipPayload,
} from "@hisaab/domain";
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
	const eventMessage = useEventMessage();
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
		const event = readEventPayload(trigger, payload);
		if (event) return eventMessage(event);
		return isNotificationTrigger(trigger)
			? i18n._(TRIGGER_LABELS[trigger])
			: t`Notification`;
	};
};

/** What an event Notification says (#62): a Recurring rule due or recorded, a Budget passed, a Loan due. */
const useEventMessage = () => {
	const { t } = useLingui();
	return (event: EventPayload) => {
		const { householdName: household } = event;
		switch (event.trigger) {
			case "recurring_due": {
				const { ruleName: rule } = event;
				return event.reminder
					? t`${rule} is still Pending in ${household}.`
					: t`${rule} is due in ${household}.`;
			}
			case "auto_recorded": {
				const { ruleName: rule } = event;
				return t`${rule} was recorded in ${household}.`;
			}
			case "budget_threshold": {
				const { categoryName: category } = event;
				return event.level === FULL
					? t`${category} has used all its Budget in ${household}.`
					: t`${category} has used 80% of its Budget in ${household}.`;
			}
			case "loan_due": {
				const { contactName: contact } = event;
				if (event.direction === LENT)
					switch (event.when) {
						case SOON:
							return t`The Loan to ${contact} is due in 3 days, in ${household}.`;
						case TODAY:
							return t`The Loan to ${contact} is due today, in ${household}.`;
						case OVERDUE:
							return t`The Loan to ${contact} is overdue, in ${household}.`;
					}
				switch (event.when) {
					case SOON:
						return t`The Loan from ${contact} is due in 3 days, in ${household}.`;
					case TODAY:
						return t`The Loan from ${contact} is due today, in ${household}.`;
					case OVERDUE:
						return t`The Loan from ${contact} is overdue, in ${household}.`;
				}
			}
		}
	};
};

// Named, as the Lingui lint rule takes any string literal in a component for copy.
const LENT = "lent";
const FULL = 100;
const SOON = "soon";
const TODAY = "today";
const OVERDUE = "overdue";

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
