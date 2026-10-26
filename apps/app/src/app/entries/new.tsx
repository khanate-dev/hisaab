import { useLingui } from "@lingui/react/macro";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";

import { createEntry } from "@/features/entries/actions";
import { type DraftParams, paramsToDraft } from "@/features/entries/draft";
import { EntryForm } from "@/features/entries/entry-form";
import { NeedsWallet } from "@/features/entries/needs-wallet";
import { useEntryData } from "@/features/entries/use-entry-data";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";

export default function NewEntry() {
	const { t } = useLingui();
	const params = useLocalSearchParams<DraftParams>();
	const initial = paramsToDraft(params);
	const data = useEntryData();

	// Viewers can't record Entries; reached by a link, they land on the list.
	if (data?.canWrite === false) return <Redirect href="/entries" />;
	if (!data) return null;
	const { userId, household, categories, history, wallets } = data;
	const title = initial.kind === "income" ? t`New Income` : t`New Expense`;

	return (
		<Screen title={title}>
			<Stack.Screen options={{ title }} />
			{wallets.some((w) => w.archived_at === null) ? (
				<EntryForm
					baseCurrency={household.base_currency}
					categories={categories}
					history={history}
					initial={initial}
					itemize={params.items === "1"}
					onSubmit={async (draft, currency) => {
						await createEntry(household.id, userId, draft, currency);
						leaveTo("/entries");
					}}
					submitLabel={t`Save Entry`}
					timeZone={entryTimeZone(household)}
					wallets={wallets}
				/>
			) : (
				<NeedsWallet />
			)}
		</Screen>
	);
}
