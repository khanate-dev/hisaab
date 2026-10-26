import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { EntryList } from "@/features/entries/entry-list";
import { useEntryViews } from "@/features/entries/use-entries";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { LoansTile } from "@/features/loans/loans-tile";
import { useLoans } from "@/features/loans/use-loans";
import { Screen } from "@/features/shell/screen";
import { WalletList } from "@/features/wallets/wallet-list";
import { useWallets } from "@/features/wallets/use-wallets";
import { useSignedInUserId } from "@/lib/session";

const RECENT_ENTRIES = 5;

export default function Home() {
	const { t } = useLingui();
	const personal = usePersonalHousehold(useSignedInUserId());
	const wallets = useWallets(personal?.id);
	const recent = useEntryViews(personal?.id)?.slice(0, RECENT_ENTRIES);
	const loans = useLoans(personal?.id);

	return (
		<Screen title={t`Home`}>
			<Text variant="title">{t`Wallets`}</Text>
			<WalletList
				onOpen={(id) => router.push(`/wallets/${id}`)}
				wallets={wallets}
			/>
			<Button
				onPress={() => router.push("/wallets")}
				variant="secondary"
			>
				{t`All Wallets`}
			</Button>
			{loans !== undefined && (
				<LoansTile
					loans={loans}
					onOpen={() => router.push("/loans")}
				/>
			)}
			<Text variant="title">{t`Recent Entries`}</Text>
			{recent !== undefined && (
				<EntryList
					items={recent}
					onOpen={(id) => router.push(`/entries/${id}`)}
				/>
			)}
			<Button
				onPress={() => router.push("/entries")}
				variant="secondary"
			>
				{t`All Entries`}
			</Button>
		</Screen>
	);
}
