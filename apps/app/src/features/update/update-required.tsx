import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

type Props = {
	/** Loads the newer build when the app can do that itself (a reload on web). */
	onUpdate?: (() => void) | undefined;
};

/** The hard block for a build below the server's minimum contract version (ADR-0009). There is no read-only mode. */
export const UpdateRequired = ({ onUpdate }: Props) => (
	<View className="flex-1 justify-center gap-4 bg-bg p-6">
		<Text variant="heading">Update required</Text>
		<Text>
			This version of Hisaab is too old to sync. Your changes are safe on this
			device and will sync after you update.
		</Text>
		{onUpdate ? (
			<Button onPress={onUpdate}>Update now</Button>
		) : (
			<Text variant="muted">
				Update Hisaab from your app store, then open it again.
			</Text>
		)}
	</View>
);
