import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";

/**
 * Hearing about a Recurring rule (issue #9): its maker always does when it's due or Auto-recorded; anyone else who
 * writes in the household can ask to as well.
 */
export const NotifyMe = ({
	isMaker,
	on,
	onChange,
}: {
	isMaker: boolean;
	on: boolean;
	onChange: (on: boolean) => void;
}) => {
	const { t } = useLingui();
	if (isMaker)
		return (
			<Text variant="muted">
				{t`You made this rule, so you're told when it's due or recorded.`}
			</Text>
		);
	const label = t`Notify me about this rule`;
	return (
		<View className="gap-1">
			<Chip
				accessibilityLabel={label}
				checked={on}
				onPress={() => onChange(!on)}
			>
				{label}
			</Chip>
			<Text variant="muted">
				{t`Be told when it's due, or when it records an Entry, as its maker is.`}
			</Text>
		</View>
	);
};
