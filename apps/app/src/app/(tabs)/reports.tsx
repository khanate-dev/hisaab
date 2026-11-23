import {
	drillDown,
	reportPeriod,
	spendingByCategory,
	writeSavedCriteria,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useMemo, useState } from "react";

import { Text } from "@/components/ui/text";
import { useCategories } from "@/features/categories/use-categories";
import { useEntries, useEntryItems } from "@/features/entries/use-entries";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembers } from "@/features/members/use-members";
import {
	DEFAULT_SETTINGS,
	ReportControls,
	type ReportSettings,
} from "@/features/reports/report-controls";
import { SpendingByCategoryReport } from "@/features/reports/spending-by-category";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

/** What Spending by category counts, and so what its figures open. */
const EXPENSE = "expense" as const;
const SPENDING_KINDS = [EXPENSE];

/**
 * The Reports hub (spec §3.5): it opens with Spending by category over a range of Budget months, compared with the
 * previous period or the 3-month average, for everyone or the members picked. Every figure opens its Entries.
 */
export default function Reports() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const entries = useEntries(household?.id);
	const items = useEntryItems(household?.id);
	const categories = useCategories(household?.id);
	const members = useMembers(household?.id);
	// Back to the defaults in another household.
	const [chosen, setChosen] = useState({
		householdId: household?.id,
		settings: DEFAULT_SETTINGS,
	});
	const settings =
		chosen.householdId === household?.id ? chosen.settings : DEFAULT_SETTINGS;
	const choose = (next: ReportSettings) =>
		setChosen({ householdId: household?.id, settings: next });

	const today = household ? todayIn(entryTimeZone(household)) : undefined;
	const startDay = household?.budget_month_start_day;
	const currency = household?.base_currency;
	const period = useMemo(
		() =>
			today !== undefined && startDay !== undefined
				? reportPeriod(settings.preset, today, startDay)
				: undefined,
		[settings.preset, today, startDay],
	);
	const report = useMemo(
		() =>
			entries && items && categories && currency && period && startDay
				? spendingByCategory({
						entries,
						items,
						categories,
						members: settings.members,
						period,
						startDay,
						currency,
					})
				: undefined,
		[entries, items, categories, currency, period, startDay, settings.members],
	);

	if (household && !currency)
		return (
			<Screen title={t`Reports`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`Reports are in the household's Base currency, which its first Wallet sets.`}
				</Text>
			</Screen>
		);

	return (
		<Screen title={t`Reports`}>
			<Text variant="title">{t`Spending by category`}</Text>
			{members && (
				<ReportControls
					members={members.map((m) => ({
						userId: m.userId,
						name: m.name ?? t`Someone`,
					}))}
					onChange={choose}
					settings={settings}
				/>
			)}
			{report && period && (
				<SpendingByCategoryReport
					comparison={settings.comparison}
					onDrillDown={(categoryId) =>
						router.push({
							pathname: "/entries",
							params: {
								filter: writeSavedCriteria(
									drillDown({
										period,
										kinds: SPENDING_KINDS,
										members: settings.members,
										...(categoryId !== undefined && { categoryId }),
									}),
								),
							},
						})
					}
					report={report}
				/>
			)}
		</Screen>
	);
}
