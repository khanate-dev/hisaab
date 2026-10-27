import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { recordableWallets } from "@/features/entries/draft";
import { useHouseholdHasEntries } from "@/features/entries/use-entries";
import {
	setDefaultWallet,
	updateHouseholdSettings,
} from "@/features/households/actions";
import { HouseholdSettingsForm } from "@/features/households/household-settings";
import { isPersonalHousehold } from "@/features/households/is-personal";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembership } from "@/features/households/use-membership";
import { deleteHousehold, removeMembership } from "@/features/members/actions";
import { HouseholdExit } from "@/features/members/household-exit";
import { useMembers } from "@/features/members/use-members";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { deviceTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function HouseholdSettings() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const membership = useMembership(household?.id, userId);
	const hasEntries = useHouseholdHasEntries(household?.id);
	const wallets = useWalletRows(household?.id);
	const members = useMembers(household?.id);
	if (
		!household ||
		!membership ||
		hasEntries === undefined ||
		!wallets ||
		!members
	)
		return null;
	const isPersonal = isPersonalHousehold(household, userId);
	const isAdmin = membership.role === "admin";
	const admins = members.filter((member) => member.role === "admin").length;

	return (
		<Screen title={isPersonal ? t`Personal` : household.name}>
			{!isPersonal && (
				<View className="flex-row flex-wrap gap-3">
					<Button
						onPress={() => router.push("/members")}
						variant="secondary"
					>
						{t`Members & Roles`}
					</Button>
					{isAdmin && (
						<Button
							onPress={() => router.push("/invites")}
							variant="secondary"
						>
							{t`Invites`}
						</Button>
					)}
				</View>
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
				isAdmin={isAdmin}
				isPersonal={isPersonal}
				// Remounts on a switch, so the form starts from the household now on screen.
				key={household.id}
				onSave={(settings) => updateHouseholdSettings(household.id, settings)}
				timeZoneFallback={deviceTimeZone()}
			/>
			{!isPersonal && (
				<HouseholdExit
					householdName={household.name}
					isAdmin={isAdmin}
					lastAdmin={isAdmin && admins === 1}
					// The household goes from this device; the screen falls back to Personal.
					onDelete={async () => {
						await deleteHousehold(household.id);
						leaveTo("/");
					}}
					onLeave={async () => {
						await removeMembership(membership.id);
						leaveTo("/");
					}}
				/>
			)}
		</Screen>
	);
}
