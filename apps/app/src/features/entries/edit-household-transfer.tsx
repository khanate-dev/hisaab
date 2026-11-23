import { isNegative, magnitude, parseMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { useHousehold } from "@/features/households/use-household";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone } from "@/lib/dates";

import { updateHouseholdTransfer } from "./actions";
import { TransferForm } from "./transfer-form";
import type { Entry } from "./types";
import { useLinkedHalves } from "./use-entries";
import { useRates } from "./use-rates";
import { useTransferTargets } from "./use-transfer-targets";

/**
 * Editing a cross-household transfer (ADR-0003): both halves at once, by whoever made it, from the household the
 * money left. Anyone else, or its maker once out of either household, sees why not.
 */
export const EditHouseholdTransfer = ({
	entry,
	currency,
	userId,
	onSaved,
}: {
	/** The half in the household on screen. */
	entry: Entry;
	/** Its Wallet's currency, which its amount is in. */
	currency: string;
	userId: string;
	onSaved: () => void;
}) => {
	const { t } = useLingui();
	const halves = useLinkedHalves(entry.link_id);
	// Signed by its effect on its Wallet: the half on screen leaves if it's negative, and the other one is its mirror.
	const shownLeaves = isNegative(parseMoney(entry.amount, currency));
	const other = halves?.find((h) => h.id !== entry.id);
	const shown = halves?.find((h) => h.id === entry.id);
	const leaves = shownLeaves ? shown : other;
	const arrives = shownLeaves ? other : shown;
	const from = useHousehold(leaves?.household_id);
	const wallets = useWalletRows(leaves?.household_id);
	const targets = useTransferTargets(userId, leaves?.household_id);
	const rates = useRates();
	// The other household's Wallets, archived ones too: the half's own Wallet stays offered once archived.
	const arrivalWallets = useWalletRows(arrives?.household_id);
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
	if (!from || !wallets || !targets || !arrivalWallets) return null;
	const arrivedIn = arrivalWallets.find((w) => w.id === arrives.wallet_id);
	// What arrived, in the other half's Wallet's currency.
	const received = arrivedIn
		? magnitude(parseMoney(arrives.amount, arrivedIn.currency)).toString()
		: undefined;
	const destination = targets
		.filter((h) => h.householdId === arrives.household_id)
		.map((h) => ({
			...h,
			wallets:
				arrivedIn && !h.wallets.some((w) => w.id === arrivedIn.id)
					? [...h.wallets, arrivedIn]
					: h.wallets,
		}));
	return (
		<TransferForm
			baseCurrency={from.base_currency}
			entry={leaves}
			initialReceived={received}
			initialToWalletId={arrives.wallet_id}
			onSubmit={async (draft, currencies) => {
				await updateHouseholdTransfer(
					{ leaves: leaves.id, arrives: arrives.id },
					draft,
					currencies,
				);
				onSaved();
			}}
			rates={rates}
			otherHouseholds={destination}
			submitLabel={t`Save`}
			timeZone={entryTimeZone(from)}
			wallets={wallets}
			withinHousehold={false}
		/>
	);
};
