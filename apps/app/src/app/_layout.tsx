import { PowerSyncContext } from "@powersync/react";
import { Stack } from "expo-router";
import { Platform } from "react-native";

import { UpdateRequired } from "@/features/update/update-required";
import { useUpdateRequired } from "@/features/update/use-update-required";

import { powersync } from "@/lib/powersync";
import { SessionProvider, useSession } from "@/lib/session";

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

	return (
		<Stack>
			<Stack.Protected guard={session !== null}>
				<Stack.Screen
					name="index"
					options={{ title: "Hisaab" }}
				/>
				<Stack.Screen
					name="sync-status"
					options={{ presentation: "modal", title: "Sync status" }}
				/>
			</Stack.Protected>
			<Stack.Protected guard={session === null}>
				<Stack.Screen
					name="sign-in"
					options={{ title: "Sign in" }}
				/>
			</Stack.Protected>
		</Stack>
	);
};

export default function RootLayout() {
	return (
		<PowerSyncContext value={powersync}>
			<SessionProvider>
				<Routes />
			</SessionProvider>
		</PowerSyncContext>
	);
}
