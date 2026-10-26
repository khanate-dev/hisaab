import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import { Button } from "@/components/ui/button";

import { recordableWallets } from "@/features/entries/draft";
import { useHouseholdHasEntries } from "@/features/entries/use-entries";
import {
	setDefaultWallet,
	updateHouseholdSettings,
} from "@/features/households/actions";
import { HouseholdSettingsForm } from "@/features/households/household-settings";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembership } from "@/features/households/use-membership";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { deviceTimeZone } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";
import { isPersonalHousehold } from "@/features/households/is-personal";

export default function HouseholdSettings() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const membership = useMembership(household?.id, userId);
	const hasEntries = useHouseholdHasEntries(household?.id);
	const wallets = useWalletRows(household?.id);
	if (!household || !membership || hasEntries === undefined || !wallets)
		return null;
	const isPersonal = isPersonalHousehold(household, userId);

	return (
		<Screen title={isPersonal ? t`Personal` : household.name}>
			{membership.role === "admin" && !isPersonal && (
				<Button
					onPress={() => router.push("/invites")}
					variant="secondary"
				>
					{t`Invites`}
				</Button>
			)}
			<HouseholdSettingsForm
				currencyLocked={hasEntries}
				defaultWallet={
					membership.role === "viewer"
						? undefined
						: {
								wallets: recordableWallets(wallets, household.base_currency),
								walletId: membership.default_wallet_id,
								onPick: (walletId) => setDefaultWallet(membership.id, walletId),
							}
				}
				household={household}
				isAdmin={membership.role === "admin"}
				isPersonal={isPersonal}
				// Remounts on a switch, so the form starts from the household now on screen.
				key={household.id}
				onSave={(settings) => updateHouseholdSettings(household.id, settings)}
				timeZoneFallback={deviceTimeZone()}
			/>
		</Screen>
	);
}
