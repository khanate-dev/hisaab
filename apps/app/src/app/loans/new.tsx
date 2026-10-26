import { useLingui } from "@lingui/react/macro";
import { Redirect } from "expo-router";

import { useContacts } from "@/features/contacts/use-contacts";
import { NeedsWallet } from "@/features/entries/needs-wallet";
import { useEntryData } from "@/features/entries/use-entry-data";
import { createLoan } from "@/features/loans/actions";
import { LoanForm } from "@/features/loans/loan-form";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";

export default function NewLoan() {
	const { t } = useLingui();
	const data = useEntryData();
	const contacts = useContacts(data?.household.id);

	// Viewers can't record Loans; reached by a link, they land on the list.
	if (data?.canWrite === false) return <Redirect href="/loans" />;
	if (!data || !contacts) return null;
	const { userId, household, wallets } = data;

	return (
		<Screen title={t`New Loan`}>
			{wallets.some((w) => w.archived_at === null) ? (
				<LoanForm
					baseCurrency={household.base_currency}
					contacts={contacts}
					onSubmit={async (draft, currency) => {
						const id = await createLoan(household.id, userId, draft, currency);
						leaveTo(`/loans/${id}`);
					}}
					timeZone={entryTimeZone(household)}
					wallets={wallets}
				/>
			) : (
				<NeedsWallet />
			)}
		</Screen>
	);
}
