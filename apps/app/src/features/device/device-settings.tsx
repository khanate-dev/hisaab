import { APPEARANCES, type Appearance } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";

/** This device's own settings (spec §4.1, §5): its appearance, and the optional biometric app lock. */
export const DeviceSettings = ({
	appearance,
	onAppearance,
	lockAvailable,
	lockOn,
	onLock,
	lockProblem,
}: {
	appearance: Appearance;
	onAppearance: (appearance: Appearance) => void;
	/** Whether this device can lock the app: native, with biometrics set up. */
	lockAvailable: boolean;
	lockOn: boolean;
	onLock: (on: boolean) => void;
	lockProblem: string | null;
}) => {
	const { t } = useLingui();
	const labels: Record<Appearance, string> = {
		system: t`Like the device`,
		light: t`Light`,
		dark: t`Dark`,
	};
	return (
		<View className="gap-4">
			<Text variant="title">{t`This device`}</Text>
			<RadioGroup
				label={t`Appearance`}
				onValueChange={onAppearance}
				options={APPEARANCES.map((a) => ({ value: a, label: labels[a] }))}
				value={appearance}
			/>
			{lockAvailable && (
				<View className="gap-1">
					<Chip
						checked={lockOn}
						onPress={() => onLock(!lockOn)}
					>
						{t`App lock`}
					</Chip>
					<Text variant="muted">{t`Ask for Face ID, a fingerprint or the device passcode to open Hisaab here.`}</Text>
					{lockProblem !== null && (
						<Text
							className="text-bad"
							role="alert"
						>
							{lockProblem}
						</Text>
					)}
				</View>
			)}
		</View>
	);
};
