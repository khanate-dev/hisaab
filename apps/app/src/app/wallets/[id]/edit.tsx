import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/features/shell/screen";
import { updateWallet } from "@/features/wallets/actions";
import { useWallet } from "@/features/wallets/use-wallets";
import { WalletForm } from "@/features/wallets/wallet-form";

export default function EditWallet() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const wallet = useWallet(id);
	if (!wallet) return null;

	return (
		<Screen title={t`Edit Wallet`}>
			<WalletForm
				baseCurrency={wallet.row.currency}
				currencyLocked={wallet.hasEntries}
				initial={{
					name: wallet.row.name,
					type: wallet.row.type,
					currency: wallet.row.currency,
				}}
				onSubmit={async (draft) => {
					await updateWallet(id, draft);
					// Opened directly (a reload or a link), there is no screen to go back to.
					if (router.canGoBack()) router.back();
					else router.replace(`/wallets/${id}`);
				}}
				submitLabel={t`Save`}
			/>
		</Screen>
	);
}
