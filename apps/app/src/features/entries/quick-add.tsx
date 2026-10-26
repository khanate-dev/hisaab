import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { entryTimeZone } from "@/lib/dates";

import { createEntry, createTransfer } from "./actions";
import { draftToParams } from "./draft";
import { NeedsWallet } from "./needs-wallet";
import { QuickAddForm } from "./quick-add-form";
import { TransferForm } from "./transfer-form";
import { useEntryData } from "./use-entry-data";

/** Quick-add's content, for the household on screen; `onDone` closes the sheet or dialog. */
export const QuickAdd = ({ onDone }: { onDone: () => void }) => {
	const { t } = useLingui();
	const data = useEntryData();
	// The segment's Transfer swaps the sheet's content to the Transfer form: one sheet, From, To and amount (spec §4.3).
	const [transferring, setTransferring] = useState(false);

	if (!data) return null;
	const {
		userId,
		household,
		canWrite,
		categories,
		history,
		wallets,
		defaultWalletId,
	} = data;
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
	const timeZone = entryTimeZone(household);

	if (transferring) {
		return (
			<ScrollView keyboardShouldPersistTaps="handled">
				<View className="gap-3">
					<Chip
						onPress={() => setTransferring(false)}
					>{t`Expense or Income instead`}</Chip>
					<TransferForm
						baseCurrency={household.base_currency}
						defaultWalletId={defaultWalletId}
						onSubmit={async (draft, currencies) => {
							await createTransfer(household.id, userId, draft, currencies);
							onDone();
						}}
						submitLabel={t`Save Transfer`}
						timeZone={timeZone}
						wallets={wallets}
					/>
				</View>
			</ScrollView>
		);
	}

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<QuickAddForm
				baseCurrency={household.base_currency}
				defaultWalletId={defaultWalletId}
				categories={categories}
				history={history}
				onOpenFullForm={(draft) => {
					onDone();
					router.push({
						pathname: "/entries/new",
						params: { ...draftToParams(draft), items: "1" },
					});
				}}
				onOpenTransfer={() => setTransferring(true)}
				onSubmit={async (draft, currency) => {
					await createEntry(household.id, userId, draft, currency);
					onDone();
				}}
				timeZone={timeZone}
				wallets={wallets}
			/>
		</ScrollView>
	);
};
