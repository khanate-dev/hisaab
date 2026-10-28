import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** What a locked app shows, with nothing of the User's data behind it. It asks for the unlock as soon as it shows. */
export const LockScreen = ({
	onUnlock,
	failed,
}: {
	onUnlock: () => void;
	failed: boolean;
}) => {
	const { t } = useLingui();
	// Asked once on showing; the button asks again.
	const asked = useRef(false);
	useEffect(() => {
		if (asked.current) return;
		asked.current = true;
		onUnlock();
	}, [onUnlock]);
	return (
		<View className="flex-1 items-center justify-center gap-4 bg-bg p-6">
			<Text variant="heading">{t`Hisaab is locked`}</Text>
			{failed && (
				<Text
					className="text-bad"
					role="alert"
				>
					{t`That didn't unlock it. Try again.`}
				</Text>
			)}
			<Button onPress={onUnlock}>{t`Unlock`}</Button>
		</View>
	);
};
