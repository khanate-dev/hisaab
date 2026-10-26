import { isFlowKind } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { useCategories } from "@/features/categories/use-categories";
import { createEntry } from "@/features/entries/actions";
import { EntryForm } from "@/features/entries/entry-form";
import { useEntries } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function NewEntry() {
	const { t } = useLingui();
	const params = useLocalSearchParams<{
		kind?: string;
		wallet?: string;
		amount?: string;
		category?: string;
		description?: string;
		date?: string;
	}>();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId);
	const categories = useCategories(household?.id);
	const history = useEntries(household?.id);
	const wallets = useWalletRows(household?.id);

	// Viewers can't record Entries; reached by a link, they land on the list.
	if (canWrite === false) return <Redirect href="/entries" />;
	if (
		!household ||
		canWrite === undefined ||
		!categories ||
		!history ||
		!wallets
	)
		return null;
	const kind = isFlowKind(params.kind) ? params.kind : undefined;
	const title = kind === "income" ? t`New Income` : t`New Expense`;

	const timeZone = entryTimeZone(household);

	return (
		<Screen title={title}>
			<Stack.Screen options={{ title }} />
			{wallets.some((w) => w.archived_at === null) ? (
				<EntryForm
					categories={categories}
					history={history}
					onSubmit={async (draft, currency) => {
						await createEntry(household.id, userId, draft, currency);
						leaveTo("/entries");
					}}
					submitLabel={t`Save Entry`}
					baseCurrency={household.base_currency}
					timeZone={timeZone}
					wallets={wallets}
					initial={{
						...(kind && { kind }),
						...(params.wallet && { walletId: params.wallet }),
						...(params.amount && { amount: params.amount }),
						...(params.category && { categoryId: params.category }),
						...(params.description && { description: params.description }),
						...(params.date && { occurredOn: params.date }),
					}}
				/>
			) : (
				<Text
					role="status"
					variant="muted"
				>
					{t`Add a Wallet first: every Entry comes out of or goes into one.`}
				</Text>
			)}
		</Screen>
	);
}
