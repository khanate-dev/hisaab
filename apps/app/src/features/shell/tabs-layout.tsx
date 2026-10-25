import { useLingui } from "@lingui/react/macro";
import { Tabs, useNavigation, usePathname } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { useColors } from "@/theme/theme";

import { useIsWide } from "./layout";
import { QuickAddProvider } from "./quick-add";
import { SECTIONS, TAB_ORDER } from "./sections";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

/** The app shell around the four sections: tabs and a top bar on phones; on wide web a sidebar holds all of it. */
export const TabsLayout = () => {
	const { i18n } = useLingui();
	const wide = useIsWide();
	const colors = useColors();
	const navigation = useNavigation();
	const pathname = usePathname();
	const section = SECTIONS.find((s) => s.href === pathname);
	const title = section ? i18n._(section.title) : undefined;
	// The shell's title is the back link's label on screens above it, so it names the section they were opened from.
	useEffect(() => {
		if (title !== undefined) navigation.setOptions({ title });
	}, [navigation, title]);

	return (
		<QuickAddProvider>
			<View className="flex-1 flex-row bg-bg">
				{wide && <Sidebar />}
				<View className="flex-1">
					<Tabs
						screenOptions={{
							// On wide web the sidebar carries the pill, Me & household and Notifications.
							headerShown: !wide,
							header: () => <TopBar />,
							sceneStyle: { backgroundColor: colors.bg },
						}}
						tabBar={(props) => (wide ? null : <TabBar {...props} />)}
					>
						{TAB_ORDER.map((route) => {
							const section = SECTIONS.find((s) => s.route === route);
							return (
								<Tabs.Screen
									key={route}
									name={route}
									options={section ? { title: i18n._(section.title) } : {}}
								/>
							);
						})}
					</Tabs>
				</View>
			</View>
		</QuickAddProvider>
	);
};
