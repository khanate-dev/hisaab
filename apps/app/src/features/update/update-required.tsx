import { Trans, useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

type Props = {
	/** Loads the newer build when the app can do that itself (a reload on web). */
	onUpdate?: (() => void) | undefined;
};

/** The hard block for a build below the server's minimum contract version (ADR-0009). There is no read-only mode. */
export const UpdateRequired = ({ onUpdate }: Props) => {
	const { t } = useLingui();
	return (
		<View className="flex-1 justify-center gap-4 bg-bg p-6">
			<Text variant="heading">{t`Update required`}</Text>
			<Text>
				<Trans>
					This version of Hisaab is too old to sync. Your changes are safe on
					this device and will sync after you update.
				</Trans>
			</Text>
			{onUpdate ? (
				<Button onPress={onUpdate}>{t`Update now`}</Button>
			) : (
				<Text variant="muted">
					<Trans>Update Hisaab from your app store, then open it again.</Trans>
				</Text>
			)}
		</View>
	);
};
