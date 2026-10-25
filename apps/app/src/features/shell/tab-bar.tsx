import { useLingui } from "@lingui/react/macro";
import { Plus } from "lucide-react-native";
import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { usePressIn } from "@/components/ui/pressable-surface";
import { Text } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

import { useQuickAdd } from "./quick-add";
import { ADD_ROUTE, SECTIONS } from "./sections";

type TabBarProps = Parameters<
	NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** The raised centre ＋: quick-add, the most frequent action, opens over the current tab. */
const AddButton = () => {
	const { t } = useLingui();
	const quickAdd = useQuickAdd();
	const pressIn = usePressIn("control", {});
	return (
		<Pressable
			accessibilityLabel={t`New entry`}
			accessibilityRole="tab"
			className="-mt-6 size-16 items-center justify-center rounded-full border-3 border-border bg-primary"
			onPress={quickAdd.open}
			{...pressIn}
		>
			<Icon
				as={Plus}
				color={useColors()["on-accent"]}
				size={30}
			/>
		</Pressable>
	);
};

/** Phone tabs: Home · Entries · ＋ · Budgets · Reports (Navigation ticket, #17). */
export const TabBar = ({ state, navigation }: TabBarProps) => {
	const { i18n } = useLingui();
	const colors = useColors();
	const active = state.routes[state.index]?.name;

	return (
		<View className="flex-row items-center justify-around border-t-3 border-border bg-surface pb-4 pt-2">
			{state.routes.map((route) => {
				if (route.name === ADD_ROUTE) return <AddButton key={route.key} />;
				const section = SECTIONS.find((s) => s.route === route.name);
				if (!section) return null;
				const selected = route.name === active;
				const title = i18n._(section.title);
				return (
					<Pressable
						accessibilityLabel={title}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						className="min-w-16 items-center gap-1 py-1"
						key={route.key}
						onPress={() => {
							const event = navigation.emit({
								type: "tabPress",
								target: route.key,
								canPreventDefault: true,
							});
							if (!selected && !event.defaultPrevented)
								navigation.navigate(route.name);
						}}
					>
						<Icon
							as={section.icon}
							color={selected ? colors.ink : colors.muted}
						/>
						<Text
							className={selected ? "" : "text-muted"}
							variant="label"
						>
							{title}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
};
