import {
	isOn,
	type MemberRole,
	NOTIFICATION_TRIGGERS,
	type NotificationPreference,
	type NotificationTrigger,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";

import { TRIGGER_HINTS, TRIGGER_LABELS } from "./labels";

/**
 * A User's notification preferences in one household (spec §3.5): each trigger on or off, starting from their
 * Role's defaults. The inbox always gets what's on.
 */
export const PreferencesList = ({
	householdName,
	userId,
	role,
	preferences,
	onChange,
}: {
	householdName: string;
	userId: string;
	role: MemberRole;
	preferences: readonly NotificationPreference[];
	onChange: (trigger: NotificationTrigger, enabled: boolean) => void;
}) => {
	const { t, i18n } = useLingui();
	return (
		<View className="gap-3">
			<Text variant="muted">{t`Which Notifications you get from ${householdName}. Each one you get lands in your inbox.`}</Text>
			{NOTIFICATION_TRIGGERS.map((trigger) => {
				const on = isOn(trigger, { userId, role }, preferences);
				const label = i18n._(TRIGGER_LABELS[trigger]);
				return (
					<View
						className="gap-1"
						key={trigger}
					>
						<Chip
							accessibilityLabel={label}
							checked={on}
							onPress={() => onChange(trigger, !on)}
						>
							{label}
						</Chip>
						<Text variant="muted">{i18n._(TRIGGER_HINTS[trigger])}</Text>
					</View>
				);
			})}
		</View>
	);
};
