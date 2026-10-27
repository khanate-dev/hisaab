import { budgetMonthOf } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { BudgetsTile } from "@/features/budgets/budgets-tile";
import { useBudgetMonth } from "@/features/budgets/use-budgets";
import { EntryList } from "@/features/entries/entry-list";
import { useEntryViews } from "@/features/entries/use-entries";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { LoansTile } from "@/features/loans/loans-tile";
import { useLoans } from "@/features/loans/use-loans";
import { Screen } from "@/features/shell/screen";
import { WalletList } from "@/features/wallets/wallet-list";
import { useWallets } from "@/features/wallets/use-wallets";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

const RECENT_ENTRIES = 5;

export default function Home() {
	const { t } = useLingui();
	const household = useCurrentHousehold(useSignedInUserId());
	const wallets = useWallets(household?.id);
	const recent = useEntryViews(household?.id)?.slice(0, RECENT_ENTRIES);
	const loans = useLoans(household?.id);
	const today = todayIn(entryTimeZone(household));
	const budgets = useBudgetMonth(
		household,
		household
			? budgetMonthOf(today, household.budget_month_start_day)
			: undefined,
		today,
	)?.budgets;

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
			{budgets !== undefined && (
				<BudgetsTile
					budgets={budgets}
					onOpen={() => router.push("/budgets")}
				/>
			)}
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
