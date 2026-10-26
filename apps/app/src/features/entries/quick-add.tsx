import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { ScrollView } from "react-native";

import { Text } from "@/components/ui/text";
import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

import { createEntry } from "./actions";
import { QuickAddForm } from "./quick-add-form";
import type { EntryDraft } from "./types";
import { useEntries } from "./use-entries";

/** The full form's route, carrying what quick-add has so far. */
const fullFormHref = (draft: Partial<EntryDraft>) => ({
	pathname: "/entries/new" as const,
	params: {
		...(draft.kind && { kind: draft.kind }),
		...(draft.walletId && { wallet: draft.walletId }),
		...(draft.amount && { amount: draft.amount }),
		...(draft.categoryId && { category: draft.categoryId }),
		...(draft.description && { description: draft.description }),
		...(draft.occurredOn && { date: draft.occurredOn }),
	},
});

/** Quick-add's content, for the household on screen; `onDone` closes the sheet or dialog. */
export const QuickAdd = ({ onDone }: { onDone: () => void }) => {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId);
	const categories = useCategories(household?.id);
	const history = useEntries(household?.id);
	const wallets = useWalletRows(household?.id);

	if (
		!household ||
		canWrite === undefined ||
		!categories ||
		!history ||
		!wallets
	)
		return null;
	if (!canWrite)
		return (
			<Text variant="muted">{t`Viewers see Entries but don't record them.`}</Text>
		);
	if (!wallets.some((w) => w.archived_at === null))
		return (
			<Text variant="muted">
				{t`Add a Wallet first: every Entry comes out of or goes into one.`}
			</Text>
		);

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<QuickAddForm
				baseCurrency={household.base_currency}
				categories={categories}
				history={history}
				onOpenFullForm={(draft) => {
					onDone();
					router.push(fullFormHref(draft));
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
