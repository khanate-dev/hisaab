import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export type PushState = "unavailable" | "off" | "on" | "denied";

/**
 * Push on this device (spec §3.5): asked for here, in context, never at onboarding. Which triggers come by push is
 * chosen below it; the inbox gets everything either way.
 */
export const PushSetting = ({
	state,
	busy,
	problem,
	onTurnOn,
	onTurnOff,
}: {
	state: PushState;
	busy: boolean;
	problem: string | null;
	onTurnOn: () => void;
	onTurnOff: () => void;
}) => {
	const { t } = useLingui();
	return (
		<View className="gap-2">
			<Text variant="title">{t`Push on this device`}</Text>
			{state === "unavailable" && (
				<Text variant="muted">{t`Push isn't available here yet; your inbox still gets every Notification.`}</Text>
			)}
			{state === "denied" && (
				<Text variant="muted">
					{t`Notifications are blocked for Hisaab here. Allow them in this device's settings, then turn push on.`}
				</Text>
			)}
			{(state === "off" || state === "denied") && (
				<Button
					disabled={busy}
					onPress={onTurnOn}
				>
					{t`Turn on push notifications`}
				</Button>
			)}
			{state === "on" && (
				<>
					<Text variant="muted">{t`This device gets push notifications for what's on below.`}</Text>
					<Button
						disabled={busy}
						onPress={onTurnOff}
						variant="secondary"
					>
						{t`Turn off push notifications`}
					</Button>
				</>
			)}
			{problem !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{problem}
				</Text>
			)}
		</View>
	);
};
