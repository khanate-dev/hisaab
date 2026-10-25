import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { Bell, CircleUserRound } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";

import { HouseholdPill } from "./household-pill";

const IconButton = ({
	label,
	icon,
	onPress,
}: {
	label: string;
	icon: typeof Bell;
	onPress: () => void;
}) => (
	<Pressable
		accessibilityLabel={label}
		role="button"
		className="size-11 items-center justify-center"
		onPress={onPress}
	>
		<Icon as={icon} />
	</Pressable>
);

/** On every tab of the phone layout: the avatar opens Me & household, the pill the switcher, the bell the inbox (Navigation ticket). */
export const TopBar = () => {
	const { t } = useLingui();
	return (
		<View className="flex-row items-center justify-between gap-3 border-b-3 border-border bg-bg ps-4 pe-4 py-2">
			<IconButton
				icon={CircleUserRound}
				label={t`Me & household`}
				onPress={() => router.push("/me")}
			/>
			<HouseholdPill />
			<IconButton
				icon={Bell}
				label={t`Notifications`}
				onPress={() => router.push("/inbox")}
			/>
		</View>
	);
};
