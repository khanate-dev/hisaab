import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { ScrollView } from "react-native";

import { Text } from "@/components/ui/text";
import { entryTimeZone } from "@/lib/dates";

import { createEntry } from "./actions";
import { draftToParams } from "./draft";
import { NeedsWallet } from "./needs-wallet";
import { QuickAddForm } from "./quick-add-form";
import { useEntryData } from "./use-entry-data";

/** Quick-add's content, for the household on screen; `onDone` closes the sheet or dialog. */
export const QuickAdd = ({ onDone }: { onDone: () => void }) => {
	const { t } = useLingui();
	const data = useEntryData();

	if (!data) return null;
	const { userId, household, canWrite, categories, history, wallets } = data;
	if (!canWrite)
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`Viewers see Entries but don't record them.`}
			</Text>
		);
	if (!wallets.some((w) => w.archived_at === null)) return <NeedsWallet />;

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<QuickAddForm
				baseCurrency={household.base_currency}
				categories={categories}
				history={history}
				onOpenFullForm={(draft) => {
					onDone();
					router.push({
						pathname: "/entries/new",
						params: { ...draftToParams(draft), items: "1" },
					});
				}}
				onOpenTransfer={() => {
					onDone();
					router.push("/entries/new?kind=transfer");
				}}
				onSubmit={async (draft, currency) => {
					await createEntry(household.id, userId, draft, currency);
					onDone();
				}}
				timeZone={entryTimeZone(household)}
				wallets={wallets}
			/>
		</ScrollView>
	);
};
