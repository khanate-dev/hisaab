import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import {
	useCanManageWallets,
	useWallets,
} from "@/features/wallets/use-wallets";
import { WalletList } from "@/features/wallets/wallet-list";
import { useSignedInUserId } from "@/lib/session";

export default function Wallets() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const [showArchived, setShowArchived] = useState(false);
	const list = useWallets(household?.id, { archived: showArchived });
	const canManage = useCanManageWallets(household?.id, userId) === true;

	return (
		<Screen title={showArchived ? t`Archived Wallets` : t`Wallets`}>
			{canManage && !showArchived && (
				<Button
					onPress={() => router.push("/wallets/new")}
				>{t`Add Wallet`}</Button>
			)}
			<WalletList
				onOpen={(id) => router.push(`/wallets/${id}`)}
				wallets={list}
			/>
			<Button
				onPress={() => setShowArchived((value) => !value)}
				variant="secondary"
			>
				{showArchived ? t`Show active Wallets` : t`Show archived Wallets`}
			</Button>
		</Screen>
	);
}
