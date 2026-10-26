import { useLingui } from "@lingui/react/macro";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { createEntry, createTransfer } from "@/features/entries/actions";
import {
	type DraftParams,
	paramsToDraft,
	recordableWallets,
} from "@/features/entries/draft";
import { EntryForm } from "@/features/entries/entry-form";
import { NeedsWallet } from "@/features/entries/needs-wallet";
import { TransferForm } from "@/features/entries/transfer-form";
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
	const { userId, household, categories, history, wallets, defaultWalletId } =
		data;
	const transfer = params.kind === "transfer";
	const title = transfer
		? t`New Transfer`
		: initial.kind === "income"
			? t`New Income`
			: t`New Expense`;
	const timeZone = entryTimeZone(household);
	const activeWallets = wallets.filter((w) => w.archived_at === null).length;
	const transferable = recordableWallets(
		wallets,
		household.base_currency,
	).length;

	return (
		<Screen title={title}>
			<Stack.Screen options={{ title }} />
			{transfer ? (
				transferable >= 2 ? (
					<TransferForm
						baseCurrency={household.base_currency}
						defaultWalletId={defaultWalletId}
						onSubmit={async (draft, currencies) => {
							await createTransfer(household.id, userId, draft, currencies);
							leaveTo("/entries");
						}}
						submitLabel={t`Save Transfer`}
						timeZone={timeZone}
						wallets={wallets}
					/>
				) : (
					<Text
						role="status"
						variant="muted"
					>
						{t`A Transfer moves money between two Wallets; add another Wallet first.`}
					</Text>
				)
			) : activeWallets > 0 ? (
				<EntryForm
					baseCurrency={household.base_currency}
					defaultWalletId={defaultWalletId}
					categories={categories}
					history={history}
					initial={initial}
					itemize={params.items === "1"}
					onSubmit={async (draft, currency) => {
						await createEntry(household.id, userId, draft, currency);
						leaveTo("/entries");
					}}
					submitLabel={t`Save Entry`}
					timeZone={timeZone}
					wallets={wallets}
				/>
			) : (
				<NeedsWallet />
			)}
		</Screen>
	);
}
