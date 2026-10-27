import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { useHousehold } from "@/features/households/use-household";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone } from "@/lib/dates";

import { updateHouseholdTransfer } from "./actions";
import { TransferForm } from "./transfer-form";
import type { Entry } from "./types";
import { useLinkedHalves } from "./use-entries";
import { useTransferTargets } from "./use-transfer-targets";

/**
 * Editing a cross-household transfer (ADR-0003): both halves at once, by whoever made it, from the household the
 * money left. Anyone else, or its maker once out of either household, sees why not.
 */
export const EditHouseholdTransfer = ({
	entry,
	userId,
	onSaved,
}: {
	entry: Entry;
	userId: string;
	onSaved: () => void;
}) => {
	const { t } = useLingui();
	const halves = useLinkedHalves(entry.link_id);
	// Signed by its effect on its Wallet: the half that leaves is the negative one (exact decimal text, never zero).
	const leaves = halves?.find((h) => h.amount.startsWith("-"));
	const arrives = halves?.find((h) => h !== leaves);
	const from = useHousehold(leaves?.household_id);
	const wallets = useWalletRows(leaves?.household_id);
	const targets = useTransferTargets(userId, leaves?.household_id);
	if (halves === undefined) return null;
	if (!leaves || !arrives || entry.created_by !== userId) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`Only whoever made this cross-household transfer edits it, while they're in both households.`}
			</Text>
		);
	}
	if (!from || !wallets || !targets) return null;
	return (
		<TransferForm
			baseCurrency={from.base_currency}
			entry={leaves}
			initialToWalletId={arrives.wallet_id}
			onSubmit={async (draft, currencies) => {
				await updateHouseholdTransfer(
					{ leaves: leaves.id, arrives: arrives.id },
					draft,
					currencies.from,
				);
				onSaved();
			}}
			otherHouseholds={targets.filter(
				(h) => h.householdId === arrives.household_id,
			)}
			submitLabel={t`Save`}
			timeZone={entryTimeZone(from)}
			wallets={wallets}
			withinHousehold={false}
		/>
	);
};
