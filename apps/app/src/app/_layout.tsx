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

import {
	ONBOARDING_STEP,
	useOnboardingStep,
} from "@/features/onboarding/use-onboarding";
import { Syncing } from "@/features/shell/syncing";
import { UpdateRequired } from "@/features/update/update-required";
import { useUpdateRequired } from "@/features/update/use-update-required";
import { i18n } from "@/lib/i18n";
import { powersync } from "@/lib/powersync";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useColors } from "@/theme/theme";
import { FONTS } from "@/theme/tokens";

/** The navigator, with each group behind its guard: signed out, onboarding, or the app (Core flows ticket, #19). */
const AppStack = ({ userId }: { userId: string | null }) => {
	const colors = useColors();
	const { t } = useLingui();
	const step = useOnboardingStep(userId ?? "");
	const signedIn = userId !== null;
	if (signedIn && step === ONBOARDING_STEP.WAITING) return <Syncing />;
	const onboarded = signedIn && step === ONBOARDING_STEP.DONE;

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
			<Stack.Protected guard={onboarded}>
				<Stack.Screen
					name="(tabs)"
					// Read as the back link's label on the screens above the tabs.
					options={{ headerShown: false, title: t`Home` }}
				/>
				<Stack.Screen
					name="me"
					options={{ title: t`Me & household` }}
				/>
				<Stack.Screen
					name="inbox"
					options={{ title: t`Notifications` }}
				/>
				<Stack.Screen
					name="wallets/index"
					options={{ title: t`Wallets` }}
				/>
				<Stack.Screen
					name="wallets/new"
					options={{ title: t`New Wallet` }}
				/>
				<Stack.Screen
					name="wallets/[id]/index"
					options={{ title: t`Wallet` }}
				/>
				<Stack.Screen
					name="wallets/[id]/edit"
					options={{ title: t`Edit Wallet` }}
				/>
			</Stack.Protected>
			<Stack.Protected guard={signedIn && !onboarded}>
				<Stack.Screen
					name="onboarding"
					options={{ headerShown: false }}
				/>
			</Stack.Protected>
			<Stack.Protected guard={!signedIn}>
				<Stack.Screen
					name="sign-in"
					options={{ title: t`Sign in` }}
				/>
			</Stack.Protected>
		</Stack>
	);
};

const Routes = () => {
	const session = useSession();
	const updateRequired = useUpdateRequired();
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
	return <AppStack userId={session?.user.id ?? null} />;
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
