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
import { QueryClientProvider } from "@tanstack/react-query";
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
import { queryClient } from "@/lib/query";
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
					// Read as the back link's label on the screens above; the shell keeps it to the open section.
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
					name="activity"
					options={{ title: t`Activity log` }}
				/>
				<Stack.Screen
					name="contacts"
					options={{ title: t`Contacts` }}
				/>
				<Stack.Screen
					name="household"
					options={{ title: t`Household settings` }}
				/>
				<Stack.Screen
					name="invites"
					options={{ title: t`Invites` }}
				/>
				<Stack.Screen
					name="join"
					options={{ title: t`Join with link` }}
				/>
				<Stack.Screen
					name="households/new"
					options={{ title: t`New household` }}
				/>
				<Stack.Screen
					name="loans/index"
					options={{ title: t`Loans` }}
				/>
				<Stack.Screen
					name="loans/new"
					options={{ title: t`New Loan` }}
				/>
				<Stack.Screen
					name="loans/[id]"
					options={{ title: t`Loan` }}
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
				<Stack.Screen
					name="categories/index"
					options={{ title: t`Categories` }}
				/>
				<Stack.Screen
					name="categories/new"
					options={{ title: t`New Category` }}
				/>
				<Stack.Screen
					name="categories/[id]"
					options={{ title: t`Category` }}
				/>
				<Stack.Screen
					name="entries/new"
					options={{ title: t`New Entry` }}
				/>
				<Stack.Screen
					name="entries/[id]/index"
					options={{ title: t`Entry` }}
				/>
				<Stack.Screen
					name="entries/[id]/edit"
					options={{ title: t`Edit Entry` }}
				/>
			</Stack.Protected>
			<Stack.Protected guard={signedIn && !onboarded}>
				<Stack.Screen
					name="onboarding"
					options={{ headerShown: false }}
				/>
			</Stack.Protected>
			{/* Open signed in or out: an Invite link lands here either way. */}
			<Stack.Screen
				name="invite/[token]"
				options={{ title: t`Invite` }}
			/>
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
			<QueryClientProvider client={queryClient}>
				<PowerSyncContext value={powersync}>
					<ThemeProvider>
						<SessionProvider>
							<Routes />
						</SessionProvider>
						<PortalHost />
					</ThemeProvider>
				</PowerSyncContext>
			</QueryClientProvider>
		</I18nProvider>
	);
}
