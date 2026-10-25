import { useLingui } from "@lingui/react/macro";
import { Redirect, router } from "expo-router";

import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { createWallet } from "@/features/wallets/actions";
import { useCanWrite } from "@/features/households/use-can-write";
import { WalletForm } from "@/features/wallets/wallet-form";
import { deviceCurrency } from "@/lib/currency";
import { useSignedInUserId } from "@/lib/session";

export default function NewWallet() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId);
	// Viewers can't add Wallets; reached by a link, they land on the list.
	if (canWrite === false) return <Redirect href="/wallets" />;
	if (!household || canWrite === undefined) return null;

	return (
		<Screen title={t`New Wallet`}>
			<WalletForm
				baseCurrency={household.base_currency ?? deviceCurrency()}
				onSubmit={async (draft) => {
					const id = await createWallet(household.id, draft);
					router.replace(`/wallets/${id}`);
				}}
				submitLabel={t`Add Wallet`}
			/>
		</Screen>
	);
}
