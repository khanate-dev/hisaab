import { useLingui } from "@lingui/react/macro";
import { Redirect, useLocalSearchParams } from "expo-router";

import { useCategories } from "@/features/categories/use-categories";
import { updateEntry } from "@/features/entries/actions";
import { EntryForm } from "@/features/entries/entry-form";
import { useEntries } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone, todayIn } from "@/lib/dates";
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
	if (
		canWrite === false ||
		(entry && entry.kind !== "expense" && entry.kind !== "income")
	)
		return <Redirect href={`/entries/${id}`} />;
	if (!household || canWrite === undefined || !categories || !entry || !wallets)
		return null;
	const timeZone = entryTimeZone(household);

	return (
		<Screen title={t`Edit Entry`}>
			<EntryForm
				categories={categories}
				entry={entry}
				history={history ?? []}
				onSubmit={async (draft, currency) => {
					await updateEntry(entry.id, draft, currency);
					leaveTo(`/entries/${entry.id}`);
				}}
				submitLabel={t`Save`}
				timeZone={timeZone}
				today={todayIn(timeZone)}
				wallets={wallets}
			/>
		</Screen>
	);
}
