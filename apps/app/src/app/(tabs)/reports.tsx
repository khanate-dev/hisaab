import {
	budgetMonthRange,
	budgetVsActual,
	categoryTrend,
	drillDown,
	incomeVsExpense,
	periodEnding,
	type ReportPeriod,
	reportPeriod,
	spendingByCategory,
	writeSavedCriteria,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";

import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { useBudgetRows } from "@/features/budgets/use-budgets";
import { useCategories } from "@/features/categories/use-categories";
import { useEntries, useEntryItems } from "@/features/entries/use-entries";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembers } from "@/features/members/use-members";
import { usePeopleNames } from "@/features/members/use-people-names";
import { BudgetVsActualReport } from "@/features/reports/budget-vs-actual";
import { CategoryTrendReport } from "@/features/reports/category-trend";
import { IncomeVsExpenseReport } from "@/features/reports/income-vs-expense";
import { type Report, REPORT_LABELS, REPORTS } from "@/features/reports/labels";
import {
	DEFAULT_SETTINGS,
	ReportControls,
	type ReportSettings,
} from "@/features/reports/report-controls";
import { SpendingByCategoryReport } from "@/features/reports/spending-by-category";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

const EXPENSE = "expense" as const;

/** What the hub shows in a household, kept until another household is on screen. */
type HubState = {
	report: Report;
	settings: ReportSettings;
	/** The Category trend follows. */
	trendCategoryId: string | undefined;
};
const START: HubState = {
	report: REPORTS[0],
	settings: DEFAULT_SETTINGS,
	trendCategoryId: undefined,
};

/**
 * The Reports hub (spec §3.5): Spending by category first, then Budget vs actual, Income vs expense and Category trend,
 * each over a range of Budget months, compared with the previous period or the 3-month average, for everyone or the
 * members picked. Every figure opens the Entries it counts.
 */
export default function Reports() {
	const { t, i18n } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const entries = useEntries(household?.id);
	const items = useEntryItems(household?.id);
	const categories = useCategories(household?.id);
	const members = useMembers(household?.id);
	const budgets = useBudgetRows(household?.id);
	const names = usePeopleNames();
	const drills = useRef(0);
	// Whose Entries can be picked: the household's members, and whoever recorded any of its Entries (a Former member).
	const recorders = useMemo(() => {
		if (!members || !entries) return undefined;
		const ids = [
			...new Set([
				...members.map((m) => m.userId),
				...entries.map((e) => e.created_by),
			]),
		];
		return ids.map((id) => ({ userId: id, name: names.get(id) ?? t`Someone` }));
	}, [members, entries, names, t]);
	// Back to the start in another household.
	const [kept, setKept] = useState({
		householdId: household?.id,
		state: START,
	});
	const state = kept.householdId === household?.id ? kept.state : START;
	const update = (next: Partial<HubState>) =>
		setKept({ householdId: household?.id, state: { ...state, ...next } });
	const { settings } = state;

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
	const ready =
		entries && items && categories && currency && period && startDay && today
			? { entries, items, categories, currency, period, startDay, today }
			: undefined;
	const scope = ready && {
		entries: ready.entries,
		items: ready.items,
		categories: ready.categories,
		members: settings.members,
		period: ready.period,
		startDay: ready.startDay,
		currency: ready.currency,
	};
	const trendChoices = useMemo(
		() =>
			(categories ?? [])
				.filter((c) => c.parent_id === null && c.archived_at === null)
				.toSorted(
					(a, b) =>
						(a.kind === EXPENSE ? 0 : 1) - (b.kind === EXPENSE ? 0 : 1) ||
						a.name.localeCompare(b.name),
				),
		[categories],
	);
	const trendCategory = trendChoices.find(
		(c) => c.id === state.trendCategoryId,
	);

	/** Opens the Entries a figure counts: of these kinds, over the period or one Budget month, maybe one Category. */
	const open = (kinds: string[], categoryId?: string, month?: string) => {
		if (!household || !ready) return;
		const over: ReportPeriod =
			month === undefined
				? ready.period
				: periodEnding(month, 1, ready.startDay);
		router.push({
			pathname: "/entries",
			params: {
				household: household.id,
				// Fresh each time, so the same figure opens filtered again after the filter was cleared.
				drilled: String((drills.current += 1)),
				filter: writeSavedCriteria(
					drillDown({
						period: over,
						kinds,
						members: settings.members,
						...(categoryId !== undefined && { categoryId }),
					}),
				),
			},
		});
	};
	const monthStart = (month: string) =>
		budgetMonthRange(month, startDay ?? 1).first;

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
			<RadioGroup
				label={t`Report`}
				onValueChange={(report) => update({ report: report as Report })}
				options={REPORTS.map((report) => ({
					value: report,
					label: i18n._(REPORT_LABELS[report]),
				}))}
				value={state.report}
			/>
			{recorders && (
				<ReportControls
					members={recorders}
					onChange={(next) => update({ settings: next })}
					settings={settings}
				/>
			)}
			{ready && scope && state.report === "spending" && (
				<SpendingByCategoryReport
					comparison={settings.comparison}
					onDrillDown={(categoryId) => open([EXPENSE], categoryId)}
					report={spendingByCategory(scope)}
					today={ready.today}
				/>
			)}
			{ready && scope && budgets && state.report === "budget" && (
				<BudgetVsActualReport
					comparison={settings.comparison}
					onDrillDown={(categoryId) => open([EXPENSE], categoryId)}
					report={budgetVsActual({
						...scope,
						standing: budgets.standing,
						overrides: budgets.overrides,
						today: ready.today,
					})}
				/>
			)}
			{ready && scope && state.report === "flow" && (
				<IncomeVsExpenseReport
					comparison={settings.comparison}
					monthStart={monthStart}
					onDrillDown={(kind, month) => open([kind], undefined, month)}
					report={incomeVsExpense(scope)}
				/>
			)}
			{ready && scope && state.report === "trend" && (
				<CategoryTrendReport
					choices={trendChoices}
					chosen={trendCategory?.id}
					comparison={settings.comparison}
					monthStart={monthStart}
					onChoose={(id) => update({ trendCategoryId: id })}
					onDrillDown={(categoryId, month) => {
						const kind = trendChoices.find((c) => c.id === categoryId)?.kind;
						open(kind ? [kind] : [], categoryId, month);
					}}
					report={
						trendCategory
							? categoryTrend({ ...scope, category: trendCategory })
							: undefined
					}
				/>
			)}
		</Screen>
	);
}
