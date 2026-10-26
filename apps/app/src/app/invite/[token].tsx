import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";

import { InviteJoin } from "@/features/invites/invite-join";
import { setPendingInvite } from "@/features/invites/pending-invite";
import { Screen } from "@/features/shell/screen";
import { useSession } from "@/lib/session";

/** An Invite link's landing (spec §4.3), open signed in or out: signing in keeps the Invite for after the name. */
export default function InviteScreen() {
	const { t } = useLingui();
	const { token } = useLocalSearchParams<{ token: string }>();
	const signedIn = Boolean(useSession());
	return (
		<Screen title={t`Invite`}>
			<InviteJoin
				onJoined={() => router.replace("/")}
				onSignIn={() => {
					setPendingInvite({ token });
					router.replace("/sign-in");
				}}
				signedIn={signedIn}
				token={token}
			/>
		</Screen>
	);
}
