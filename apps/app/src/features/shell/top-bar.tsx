import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { Bell, CircleUserRound } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { useUnreadCount } from "@/features/notifications/use-notifications";
import { useSession } from "@/lib/session";

import { HouseholdPill } from "./household-pill";

const IconButton = ({
	label,
	icon,
	onPress,
	dot = false,
}: {
	label: string;
	icon: typeof Bell;
	onPress: () => void;
	/** Marks something waiting, say unread Notifications; the label says so too. */
	dot?: boolean;
}) => (
	<Pressable
		accessibilityLabel={label}
		role="button"
		className="size-11 items-center justify-center"
		onPress={onPress}
	>
		<Icon as={icon} />
		{dot && (
			<View
				accessible={false}
				className="absolute end-2 top-2 size-2.5 rounded-full bg-bad"
			/>
		)}
	</Pressable>
);

/** On every tab of the phone layout: the avatar opens Me & household, the pill the switcher, the bell the inbox (Navigation ticket). */
export const TopBar = () => {
	const { t } = useLingui();
	const unread = useUnreadCount(useSession()?.user.id);
	return (
		<View className="flex-row items-center justify-between gap-3 border-b-3 border-border bg-bg ps-4 pe-4 py-2">
			<IconButton
				icon={CircleUserRound}
				label={t`Me & household`}
				onPress={() => router.push("/me")}
			/>
			<HouseholdPill />
			<IconButton
				dot={unread > 0}
				icon={Bell}
				label={unread > 0 ? t`Notifications, ${unread} new` : t`Notifications`}
				onPress={() => router.push("/inbox")}
			/>
		</View>
	);
};
