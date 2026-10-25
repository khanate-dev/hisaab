import "../global.css";

import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black";
import {
	SpaceGrotesk_400Regular,
	SpaceGrotesk_500Medium,
	SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { I18nProvider } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";
import { PowerSyncContext } from "@powersync/react";
import { PortalHost } from "@rn-primitives/portal";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { Platform } from "react-native";

import { UpdateRequired } from "@/features/update/update-required";
import { useUpdateRequired } from "@/features/update/use-update-required";
import { i18n } from "@/lib/i18n";
import { powersync } from "@/lib/powersync";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useColors } from "@/theme/theme";
import { FONTS } from "@/theme/tokens";

const Routes = () => {
	const session = useSession();
	const updateRequired = useUpdateRequired();
	const colors = useColors();
	const { t } = useLingui();
	if (session === undefined) return null;
	// A hard block with nothing behind it; sync keeps running, so the queue survives until the update.
	if (updateRequired) {
		return (
			<UpdateRequired
				onUpdate={
					Platform.OS === "web" ? () => window.location.reload() : undefined
				}
			/>
		);
	}

	return (
		<Stack
			screenOptions={{
				contentStyle: { backgroundColor: colors.bg },
				headerStyle: { backgroundColor: colors.bg },
				headerTintColor: colors.ink,
				headerTitleStyle: { fontFamily: FONTS.heading },
				headerShadowVisible: false,
			}}
		>
			<Stack.Protected guard={session !== null}>
				<Stack.Screen
					name="(tabs)"
					options={{ headerShown: false }}
				/>
				<Stack.Screen
					name="me"
					options={{ title: t`Me & household` }}
				/>
				<Stack.Screen
					name="inbox"
					options={{ title: t`Notifications` }}
				/>
			</Stack.Protected>
			<Stack.Protected guard={session === null}>
				<Stack.Screen
					name="sign-in"
					options={{ title: t`Sign in` }}
				/>
			</Stack.Protected>
		</Stack>
	);
};

export default function RootLayout() {
	const [fontsLoaded] = useFonts({
		ArchivoBlack_400Regular,
		SpaceGrotesk_400Regular,
		SpaceGrotesk_500Medium,
		SpaceGrotesk_700Bold,
	});
	if (!fontsLoaded) return null;

	return (
		<I18nProvider i18n={i18n}>
			<PowerSyncContext value={powersync}>
				<ThemeProvider>
					<SessionProvider>
						<Routes />
					</SessionProvider>
					<PortalHost />
				</ThemeProvider>
			</PowerSyncContext>
		</I18nProvider>
	);
}
