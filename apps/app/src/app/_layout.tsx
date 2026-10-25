import { PowerSyncContext } from "@powersync/react";
import { Stack } from "expo-router";

import { powersync } from "@/lib/powersync";
import { SessionProvider, useSession } from "@/lib/session";

const Routes = () => {
	const session = useSession();
	if (session === undefined) return null;

	return (
		<Stack>
			<Stack.Protected guard={session !== null}>
				<Stack.Screen
					name="index"
					options={{ title: "Hisaab" }}
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
