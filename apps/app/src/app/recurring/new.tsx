import { useLingui } from "@lingui/react/macro";
import { Redirect } from "expo-router";

import { NeedsWallet } from "@/features/entries/needs-wallet";
import { useEntryData } from "@/features/entries/use-entry-data";
import { createRule } from "@/features/recurring/actions";
import { RuleForm } from "@/features/recurring/rule-form";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";

export default function NewRecurringRule() {
	const { t } = useLingui();
	const data = useEntryData();

	// Viewers make no rules; reached by a link, they land on the list.
	if (data?.canWrite === false) return <Redirect href="/recurring" />;
	if (!data) return null;
	const { userId, household, wallets, categories } = data;

	return (
		<Screen title={t`New Recurring rule`}>
			{household.base_currency &&
			wallets.some((w) => w.archived_at === null) ? (
				<RuleForm
					baseCurrency={household.base_currency}
					categories={categories}
					onSubmit={async (draft) => {
						await createRule(household.id, userId, draft);
						leaveTo("/recurring");
					}}
					submitLabel={t`Save Recurring rule`}
					today={todayIn(entryTimeZone(household))}
					wallets={wallets}
				/>
			) : (
				<NeedsWallet />
			)}
		</Screen>
	);
}
