import { useLingui } from "@lingui/react/macro";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { deleteEntry } from "@/features/entries/actions";
import { EntryDetail } from "@/features/entries/entry-detail";
import { useEntryTitle } from "@/features/entries/entry-list";
import { useDisplayName, useEntryViews } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { entryRights } from "@/features/entries/draft";
import { Screen } from "@/features/shell/screen";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function EntryScreen() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const views = useEntryViews(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const view = views?.find((v) => v.entry.id === id);
	const recordedBy = useDisplayName(view?.entry.created_by);
	const titleOf = useEntryTitle();

	if (views === undefined) return null;
	if (!view) {
		return (
			<Screen title={t`Entry`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`This Entry isn't here. It may have been deleted, or not synced yet.`}
				</Text>
			</Screen>
		);
	}
	const title = titleOf(view);

	return (
		<Screen title={title}>
			<Stack.Screen options={{ title }} />
			<EntryDetail
				canEdit={canWrite}
				onDelete={async () => {
					await deleteEntry(view.entry.id);
					leaveTo("/entries");
				}}
				onEdit={() => router.push(`/entries/${view.entry.id}/edit`)}
				onOpenLoan={
					view.entry.loan_id === null
						? undefined
						: () => router.push(`/loans/${view.entry.loan_id}`)
				}
				recordedBy={recordedBy}
				rights={entryRights(view.entry, userId)}
				view={view}
			/>
		</Screen>
	);
}
