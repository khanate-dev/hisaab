import { useLingui } from "@lingui/react/macro";
import { Tabs } from "expo-router";
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
