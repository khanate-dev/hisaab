import { useLingui } from "@lingui/react/macro";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";
import { archiveWallet, unarchiveWallet } from "@/features/wallets/actions";
import { useCanManageWallets, useWallet } from "@/features/wallets/use-wallets";
import { WalletDetail } from "@/features/wallets/wallet-detail";
import { useSignedInUserId } from "@/lib/session";

export default function WalletScreen() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const wallet = useWallet(id);
	const canManage = useCanManageWallets(
		wallet?.row.household_id,
		useSignedInUserId(),
	);

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
				canEdit={canManage === true}
				history={wallet.history}
				onArchive={() => archiveWallet(id)}
				onEdit={() => router.push(`/wallets/${id}/edit`)}
				onUnarchive={() => unarchiveWallet(id)}
				wallet={wallet.summary}
			/>
		</Screen>
	);
}
