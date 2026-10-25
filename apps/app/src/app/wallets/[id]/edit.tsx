import { useLingui } from "@lingui/react/macro";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/features/shell/screen";
import { updateWallet } from "@/features/wallets/actions";
import { useWallet } from "@/features/wallets/use-wallets";
import { useCanWrite } from "@/features/households/use-can-write";
import { WalletForm } from "@/features/wallets/wallet-form";
import { useSignedInUserId } from "@/lib/session";

export default function EditWallet() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const wallet = useWallet(id);
	const canManage = useCanWrite(wallet?.row.household_id, useSignedInUserId());
	// Viewers can't edit Wallets; reached by a link, they land on the Wallet itself.
	if (canManage === false) return <Redirect href={`/wallets/${id}`} />;
	if (!wallet || canManage === undefined) return null;

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
