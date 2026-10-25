import { isFlowKind } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Redirect, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { useCategories } from "@/features/categories/use-categories";
import { updateEntry } from "@/features/entries/actions";
import { EntryForm } from "@/features/entries/entry-form";
import { useEntries } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function EditEntry() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId);
	const categories = useCategories(household?.id);
	const history = useEntries(household?.id);
	const wallets = useWalletRows(household?.id);
	const entry = history?.find((e) => e.id === id);

	// Viewers can't edit; nor can anyone edit a Balance adjustment here. Either way, back to the Entry.
	if (canWrite === false || (entry && !isFlowKind(entry.kind)))
		return <Redirect href={`/entries/${id}`} />;
	if (
		!household ||
		canWrite === undefined ||
		!categories ||
		!history ||
		!wallets
	)
		return null;
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
	const timeZone = entryTimeZone(household);

	return (
		<Screen title={t`Edit Entry`}>
			<EntryForm
				categories={categories}
				entry={entry}
				history={history}
				onSubmit={async (draft, currency) => {
					await updateEntry(entry.id, draft, currency);
					leaveTo(`/entries/${entry.id}`);
				}}
				submitLabel={t`Save`}
				baseCurrency={household.base_currency}
				timeZone={timeZone}
				wallets={wallets}
			/>
		</Screen>
	);
}
