import { useLingui } from "@lingui/react/macro";

import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { InviteJoin } from "@/features/invites/invite-join";
import { usePendingInvite } from "@/features/invites/pending-invite";
import { FirstWalletForm } from "@/features/onboarding/first-wallet-form";
import { NameForm } from "@/features/onboarding/name-form";
import {
	createFirstWallet,
	ONBOARDING_STEP,
	saveName,
	useOnboardingStep,
} from "@/features/onboarding/use-onboarding";
import { Screen } from "@/features/shell/screen";
import { deviceCurrency } from "@/lib/currency";
import { useSignedInUserId } from "@/lib/session";

export default function Onboarding() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const step = useOnboardingStep(userId);
	const personal = usePersonalHousehold(userId);
	const invite = usePendingInvite();

	if (step === ONBOARDING_STEP.NAME) {
		return (
			<Screen title={t`What's your name?`}>
				<NameForm onSubmit={(name) => saveName(userId, name)} />
			</Screen>
		);
	}
	if (step === ONBOARDING_STEP.JOIN && invite) {
		return (
			<Screen title={t`Join the household`}>
				<InviteJoin
					// Already signed in here; joining ends onboarding once the Membership syncs.
					onSignIn={() => {}}
					signedIn
					token={invite.token}
				/>
			</Screen>
		);
	}
	return (
		<Screen title={t`Your first Wallet`}>
			<FirstWalletForm
				defaultCurrency={deviceCurrency()}
				onSubmit={async (wallet) => {
					if (!personal)
						throw new Error("The Personal household hasn't synced yet");
					await createFirstWallet(userId, personal.id, wallet, t`Cash`);
				}}
			/>
		</Screen>
	);
}
