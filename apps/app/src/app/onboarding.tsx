import { useLingui } from "@lingui/react/macro";

import { usePersonalHousehold } from "@/features/households/use-personal-household";
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
import { useSession } from "@/lib/session";

export default function Onboarding() {
	const { t } = useLingui();
	const userId = useSession()?.user.id ?? "";
	const step = useOnboardingStep(userId);
	const personal = usePersonalHousehold(userId);

	if (step === ONBOARDING_STEP.NAME) {
		return (
			<Screen title={t`What's your name?`}>
				<NameForm onSubmit={(name) => saveName(userId, name)} />
			</Screen>
		);
	}
	return (
		<Screen title={t`Your first Wallet`}>
			<FirstWalletForm
				defaultCurrency={deviceCurrency()}
				onSubmit={async (wallet) => {
					if (personal)
						await createFirstWallet(userId, personal.id, wallet, t`Cash`);
				}}
			/>
		</Screen>
	);
}
