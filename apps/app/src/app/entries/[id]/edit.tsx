import { isFlowKind } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Redirect, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { updateEntry } from "@/features/entries/actions";
import { EntryForm } from "@/features/entries/entry-form";
import { useItemsOf } from "@/features/entries/use-entries";
import { useEntryData } from "@/features/entries/use-entry-data";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";

export default function EditEntry() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const data = useEntryData();
	const items = useItemsOf(id);
	const entry = data?.history.find((e) => e.id === id);

	// Viewers can't edit; nor can anyone edit a Balance adjustment here. Either way, back to the Entry.
	if (data?.canWrite === false || (entry && !isFlowKind(entry.kind)))
		return <Redirect href={`/entries/${id}`} />;
	if (!data || !items) return null;
	if (!entry) {
		return (
			<Screen title={t`Edit Entry`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`This Entry isn't here. It may have been deleted, or not synced yet.`}
				</Text>
			</Screen>
		);
	}
	const { household, categories, history, wallets } = data;

	return (
		<Screen title={t`Edit Entry`}>
			<EntryForm
				baseCurrency={household.base_currency}
				categories={categories}
				entry={entry}
				history={history}
				items={items}
				onSubmit={async (draft, currency) => {
					await updateEntry(household.id, entry.id, draft, currency);
					leaveTo(`/entries/${entry.id}`);
				}}
				submitLabel={t`Save`}
				timeZone={entryTimeZone(household)}
				wallets={wallets}
			/>
		</Screen>
	);
}
