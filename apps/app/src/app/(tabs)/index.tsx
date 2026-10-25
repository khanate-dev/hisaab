import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { WalletList } from "@/features/wallets/wallet-list";
import { useWallets } from "@/features/wallets/use-wallets";
import { useSession } from "@/lib/session";

export default function Home() {
	const { t } = useLingui();
	const personal = usePersonalHousehold(useSession()?.user.id ?? "");
	const wallets = useWallets(personal?.id);

	return (
		<Screen title={t`Home`}>
			<Text variant="title">{t`Wallets`}</Text>
			<WalletList wallets={wallets} />
		</Screen>
	);
}
