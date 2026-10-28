import { useLingui } from "@lingui/react/macro";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";
import { recordBalanceAdjustment } from "@/features/entries/actions";
import { useHousehold } from "@/features/households/use-household";
import { archiveWallet, unarchiveWallet } from "@/features/wallets/actions";
import { useWallet } from "@/features/wallets/use-wallets";
import { useCanWrite } from "@/features/households/use-can-write";
import { useMembership } from "@/features/households/use-membership";
import { WalletDetail } from "@/features/wallets/wallet-detail";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

export default function WalletScreen() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const wallet = useWallet(id);
	const userId = useSignedInUserId();
	// The household the Wallet belongs to: its timezone dates the adjustment.
	const household = useHousehold(wallet?.row.household_id);
	const canWrite = useCanWrite(wallet?.row.household_id, userId);
	const isAdmin =
		useMembership(wallet?.row.household_id, userId)?.role === "admin";

	if (!wallet) {
		return (
			<Screen title={t`Wallet`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`This Wallet isn't here. It may not have synced yet.`}
				</Text>
			</Screen>
		);
	}
	return (
		<Screen title={wallet.summary.name}>
			<Stack.Screen options={{ title: wallet.summary.name }} />
			<WalletDetail
				canEdit={canWrite === true}
				history={wallet.history}
				onAdjust={(gap) =>
					recordBalanceAdjustment(
						wallet.row.household_id,
						userId,
						id,
						gap,
						todayIn(entryTimeZone(household)),
					)
				}
				onArchive={() => archiveWallet(id)}
				onEdit={() => router.push(`/wallets/${id}/edit`)}
				onUnarchive={() => unarchiveWallet(id)}
				wallet={wallet.summary}
			/>
			{isAdmin &&
				wallet.row.archived_at === null &&
				household?.base_currency === wallet.row.currency && (
					<Button
						onPress={() => router.push(`/wallets/${id}/import`)}
						variant="secondary"
					>
						{t`Import CSV`}
					</Button>
				)}
		</Screen>
	);
}
