import { importMappings } from "@hisaab/client-schema";
import { readMapping } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";
import { Redirect, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { useCategories } from "@/features/categories/use-categories";
import { useEntries } from "@/features/entries/use-entries";
import { useHousehold } from "@/features/households/use-household";
import { useMembership } from "@/features/households/use-membership";
import { importRows } from "@/features/import/actions";
import { ImportWizard } from "@/features/import/import-wizard";
import { Screen } from "@/features/shell/screen";
import { useWallet } from "@/features/wallets/use-wallets";
import { chooseCsvText } from "@/lib/files/read-text";
import { leaveTo } from "@/lib/navigation";
import { db } from "@/lib/powersync";
import { useSignedInUserId } from "@/lib/session";

export default function ImportIntoWallet() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const userId = useSignedInUserId();
	const wallet = useWallet(id);
	const householdId = wallet?.row.household_id;
	const membership = useMembership(householdId, userId);
	const household = useHousehold(householdId);
	const categories = useCategories(householdId);
	const all = useEntries(householdId);
	const saved = useQuery(
		toCompilableQuery(
			db.select().from(importMappings).where(eq(importMappings.wallet_id, id)),
		),
	);

	// CSV import is an Admin's data tool; reached by a link, anyone else lands back on the Wallet.
	if (membership !== undefined && membership?.role !== "admin")
		return <Redirect href={`/wallets/${id}`} />;
	if (
		!wallet ||
		!categories ||
		!all ||
		saved.isLoading ||
		!membership ||
		!household
	)
		return null;
	// Expenses and Incomes are recorded in the Base currency until Base amounts (#45), so imports are too.
	const blocked =
		wallet.row.archived_at !== null
			? t`This Wallet is archived; unarchive it to import into it.`
			: household.base_currency !== wallet.row.currency
				? t`Statements import into Wallets in the household's Base currency for now.`
				: null;
	if (blocked !== null) {
		return (
			<Screen title={t`Import CSV`}>
				<Text
					role="status"
					variant="muted"
				>
					{blocked}
				</Text>
			</Screen>
		);
	}

	return (
		<Screen title={t`Import CSV`}>
			<ImportWizard
				categories={categories}
				currency={wallet.row.currency}
				existing={all.filter((e) => e.wallet_id === id)}
				onChooseFile={chooseCsvText}
				onDone={() => leaveTo(`/wallets/${id}`)}
				onImport={(rows, mapping) =>
					importRows(
						{
							householdId: wallet.row.household_id,
							walletId: id,
							userId,
							currency: wallet.row.currency,
						},
						rows,
						mapping,
					)
				}
				savedMapping={readMapping(saved.data[0]?.mapping)}
				walletName={wallet.summary.name}
			/>
		</Screen>
	);
}
