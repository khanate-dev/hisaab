import { useLingui } from "@lingui/react/macro";
import { Tabs } from "expo-router";
import { View } from "react-native";

import { useColors } from "@/theme/theme";

import { useIsWide } from "./layout";
import { QuickAddProvider } from "./quick-add";
import { ADD_ROUTE, SECTIONS } from "./sections";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

/** The app shell around the four sections: tabs and a top bar on phones, a sidebar on wide web. */
export const TabsLayout = () => {
	const { i18n } = useLingui();
	const wide = useIsWide();
	const colors = useColors();
	const [home, entries, budgets, reports] = SECTIONS;

	return (
		<QuickAddProvider>
			<View className="flex-1 flex-row bg-bg">
				{wide && <Sidebar />}
				<View className="flex-1">
					<Tabs
						screenOptions={{
							header: () => <TopBar />,
							sceneStyle: { backgroundColor: colors.bg },
						}}
						tabBar={(props) => (wide ? null : <TabBar {...props} />)}
					>
						{[home, entries].map((section) => (
							<Tabs.Screen
								key={section.route}
								name={section.route}
								options={{ title: i18n._(section.title) }}
							/>
						))}
						<Tabs.Screen name={ADD_ROUTE} />
						{[budgets, reports].map((section) => (
							<Tabs.Screen
								key={section.route}
								name={section.route}
								options={{ title: i18n._(section.title) }}
							/>
						))}
					</Tabs>
				</View>
			</View>
		</QuickAddProvider>
	);
};
