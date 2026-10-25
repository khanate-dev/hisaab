import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { createWallet } from "@/features/wallets/actions";
import { WalletForm } from "@/features/wallets/wallet-form";
import { deviceCurrency } from "@/lib/currency";
import { useSignedInUserId } from "@/lib/session";

export default function NewWallet() {
	const { t } = useLingui();
	const household = usePersonalHousehold(useSignedInUserId());
	if (!household) return null;

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
