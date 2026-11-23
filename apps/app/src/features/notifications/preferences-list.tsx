import {
	isOn,
	type MemberRole,
	NOTIFICATION_TRIGGERS,
	type NotificationTrigger,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";

import { TRIGGER_HINTS, TRIGGER_LABELS } from "./labels";

const MONTHLY_SUMMARY = "monthly_summary" as const;

/**
 * A User's notification preferences in one household (spec §3.5, #13): which triggers also reach them by push,
 * starting from their Role's defaults. The inbox gets every Notification either way.
 */
export const PreferencesList = ({
	householdName,
	role,
	choices,
	onChange,
	onEmailChange,
}: {
	householdName: string;
	role: MemberRole;
	/** The User's own choices in the household, by trigger. */
	choices: readonly {
		trigger: string;
		enabled: boolean;
		email_enabled?: boolean | null;
	}[];
	onChange: (trigger: NotificationTrigger, enabled: boolean) => void;
	/** The Monthly summary by email too (#63), off unless turned on; `pushOn` is its push choice as it stands. */
	onEmailChange: (pushOn: boolean, emailOn: boolean) => void;
}) => {
	const { t, i18n } = useLingui();
	return (
		<View className="gap-3">
			<Text variant="muted">
				{t`Your inbox gets every Notification from ${householdName}. Choose which also come to your devices as push notifications.`}
			</Text>
			{NOTIFICATION_TRIGGERS.map((trigger) => {
				const on = isOn(
					trigger,
					role,
					choices.find((c) => c.trigger === trigger),
				);
				const label = i18n._(TRIGGER_LABELS[trigger]);
				const email =
					choices.find((c) => c.trigger === trigger)?.email_enabled === true;
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
						{trigger === MONTHLY_SUMMARY && (
							<Chip
								accessibilityLabel={t`Email me the Monthly summary`}
								checked={email}
								onPress={() => onEmailChange(on, !email)}
							>
								{t`Email it to me too`}
							</Chip>
						)}
					</View>
				);
			})}
		</View>
	);
};
