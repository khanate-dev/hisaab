import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { Screen } from "@/features/shell/screen";
import { useWallets } from "@/features/wallets/use-wallets";
import { WalletList } from "@/features/wallets/wallet-list";
import { useSignedInUserId } from "@/lib/session";

export default function Wallets() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const [showArchived, setShowArchived] = useState(false);
	const list = useWallets(household?.id, { archived: showArchived });
	const canWrite = useCanWrite(household?.id, userId) === true;

	return (
		<Screen title={showArchived ? t`Archived Wallets` : t`Wallets`}>
			{canWrite && !showArchived && (
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
