import { Trans } from "@lingui/react/macro";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Shown until the first sync completes, so onboarding never starts on data that hasn't arrived yet. */
export const Syncing = () => (
	<View className="flex-1 items-center justify-center bg-bg p-6">
		<Text
			role="status"
			variant="muted"
		>
			<Trans>Getting your households ready…</Trans>
		</Text>
	</View>
);
