import { ENTRY_KINDS } from "@hisaab/client-schema";
import {
	type EntryFilter,
	exportRows,
	filterEntries,
	toCsv,
	keepKnown,
	NO_FILTER,
	readSavedCriteria,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useCategories } from "@/features/categories/use-categories";
import { EntryList, useEntryTitle } from "@/features/entries/entry-list";
import { entryKindLabel } from "@/features/entries/labels";
import { useEntryViews } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useLoans } from "@/features/loans/use-loans";
import { useMembership } from "@/features/households/use-membership";
import { useMembers } from "@/features/members/use-members";
import { deleteSavedFilter, saveFilter } from "@/features/search/actions";
import { EntrySearch } from "@/features/search/entry-search";
import { toExportEntry } from "@/features/search/export";
import { toSearchable } from "@/features/search/searchable";
import { useSavedFilters } from "@/features/search/use-saved-filters";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { exportFileName } from "@/lib/files/export-name";
import { saveCsv } from "@/lib/files/save-csv";
import { useSignedInUserId } from "@/lib/session";

/** One household's Entries with their search: a household switch starts it afresh (spec §3.4). */
const SearchableEntries = ({
	householdId,
	userId,
	today,
	startDay,
	initial,
}: {
	householdId: string;
	userId: string;
	today: string;
	startDay: number;
	/** Where it starts filtered: a report's drill-down (spec §3.5). */
	initial: EntryFilter;
}) => {
	const { t, i18n } = useLingui();
	const views = useEntryViews(householdId);
	const categories = useCategories(householdId);
	const wallets = useWalletRows(householdId);
	const members = useMembers(householdId);
	const saved = useSavedFilters(householdId, userId);
	const loans = useLoans(householdId);
	const isAdmin = useMembership(householdId, userId)?.role === "admin";
	const [exportProblem, setExportProblem] = useState<string | null>(null);
	const title = useEntryTitle();
	const [filter, setFilter] = useState<EntryFilter>(initial);

	const parentOf = useMemo(
		() => new Map((categories ?? []).map((c) => [c.id, c.parent_id])),
		[categories],
	);
	const contactOf = useMemo(
		() =>
			new Map(
				(loans ?? []).flatMap(({ loan, contact }) =>
					contact
						? [[loan.id, { id: contact.id, name: contact.name }] as const]
						: [],
				),
			),
		[loans],
	);
	const shown = useMemo(
		() =>
			views === undefined
				? undefined
				: filterEntries(
						views,
						(v) => toSearchable(v, title(v), parentOf, contactOf),
						filter,
					),
		[views, filter, parentOf, contactOf, title],
	);
	const choices = useMemo(() => {
		const names = new Map((categories ?? []).map((c) => [c.id, c.name]));
		return {
			kinds: ENTRY_KINDS.map((k) => ({
				value: k,
				label: i18n._(entryKindLabel(k)),
			})),
			wallets: (wallets ?? []).map((w) => ({ value: w.id, label: w.name })),
			categories: (categories ?? [])
				.map((c) => {
					const parent =
						c.parent_id === null ? undefined : names.get(c.parent_id);
					const name = c.name;
					return {
						value: c.id,
						label: parent === undefined ? name : t`${parent}: ${name}`,
					};
				})
				.toSorted((a, b) => a.label.localeCompare(b.label)),
			currencies: [...new Set((wallets ?? []).map((w) => w.currency))]
				.toSorted()
				.map((c) => ({ value: c, label: c })),
			contacts: [
				...new Map(
					(loans ?? []).flatMap(({ contact }) =>
						contact ? [[contact.id, contact.name] as const] : [],
					),
				),
			]
				.map(([value, label]) => ({ value, label }))
				.toSorted((a, b) => a.label.localeCompare(b.label)),
			members: (members ?? []).map((m) => ({
				value: m.userId,
				label: m.name ?? t`Someone`,
			})),
		};
	}, [categories, wallets, members, loans, i18n, t]);
	// A Saved filter naming a Wallet, Category, Contact or Member since gone drops it, rather than finding nothing.
	const savedFilters = useMemo(() => {
		const known = (list: readonly { value: string }[]) =>
			new Set(list.map((c) => c.value));
		const choicesNow = {
			kinds: known(choices.kinds),
			walletIds: known(choices.wallets),
			categoryIds: known(choices.categories),
			currencies: known(choices.currencies),
			contactIds: known(choices.contacts),
			memberIds: known(choices.members),
		};
		return (saved ?? []).map((s) => ({
			id: s.id,
			name: s.name,
			filter: keepKnown(readSavedCriteria(s.criteria), choicesNow),
		}));
	}, [saved, choices]);

	if (shown === undefined || views === undefined) return null;

	const shownCount = shown.length;
	// The Spreadsheet export (Admins only): what the search shows, as a CSV.
	const exportShown = async () => {
		setExportProblem(null);
		const rows = exportRows(
			shown.map((view) =>
				toExportEntry(view, {
					kind: i18n._(entryKindLabel(view.entry.kind)),
					category: (name, parent) =>
						parent === undefined ? name : t`${parent}: ${name}`,
					parentOf: ({ parent_id }) =>
						parent_id === null
							? undefined
							: categories?.find((c) => c.id === parent_id)?.name,
					contact:
						view.entry.loan_id === null
							? null
							: (contactOf.get(view.entry.loan_id)?.name ?? null),
				}),
			),
		);
		try {
			await saveCsv(exportFileName(today), toCsv(rows));
		} catch {
			setExportProblem(t`That didn't export. Try again.`);
		}
	};

	return (
		<>
			<EntrySearch
				choices={choices}
				filter={filter}
				onChange={setFilter}
				onDeleteSaved={deleteSavedFilter}
				onSave={(name) => saveFilter(householdId, userId, name, filter)}
				saved={savedFilters}
				shown={shown.length}
				startDay={startDay}
				today={today}
				total={views.length}
			/>
			{isAdmin && shown.length > 0 && (
				<Button
					onPress={() => void exportShown()}
					variant="secondary"
				>
					{shown.length === views.length
						? t`Export CSV`
						: t`Export these ${shownCount} as CSV`}
				</Button>
			)}
			{exportProblem !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{exportProblem}
				</Text>
			)}
			{shown.length === 0 && views.length > 0 ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`No Entries match.`}
				</Text>
			) : (
				<EntryList
					items={shown}
					onOpen={(id) => router.push(`/entries/${id}`)}
				/>
			)}
		</>
	);
};

export default function Entries() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId) === true;
	// A report's figure opens the Entries it counts: `filter` holds them as a Saved filter's criteria do.
	const params = useLocalSearchParams<{
		filter?: string;
		household?: string;
		drilled?: string;
	}>();
	// Only for the household it was made in: another one's Categories and members would match nothing.
	const drilled =
		params.filter && params.household === household?.id
			? params.filter
			: undefined;

	return (
		<Screen title={t`Entries`}>
			{canWrite && (
				<View className="flex-row flex-wrap gap-3">
					<Button onPress={() => router.push("/entries/new?kind=expense")}>
						{t`Add Expense`}
					</Button>
					<Button
						onPress={() => router.push("/entries/new?kind=income")}
						variant="secondary"
					>
						{t`Add Income`}
					</Button>
					<Button
						onPress={() => router.push("/entries/new?kind=transfer")}
						variant="secondary"
					>
						{t`Add Transfer`}
					</Button>
				</View>
			)}
			{drilled !== undefined && (
				<View
					className="gap-2 rounded-control border-2 border-border p-3"
					role="status"
				>
					<Text variant="label">{t`What a report counted`}</Text>
					<Text variant="muted">
						{t`Whole Entries are listed: an itemized Expense counts in the report only for its Items in that Category, and one in another currency only once it has a Base amount.`}
					</Text>
					<Button
						onPress={() =>
							router.setParams({
								filter: undefined,
								household: undefined,
								drilled: undefined,
							})
						}
						variant="secondary"
					>
						{t`Show every Entry`}
					</Button>
				</View>
			)}
			{household && (
				<SearchableEntries
					householdId={household.id}
					initial={drilled ? readSavedCriteria(drilled) : NO_FILTER}
					key={`${household.id} ${drilled ? (params.drilled ?? "") : ""}`}
					startDay={household.budget_month_start_day}
					today={todayIn(entryTimeZone(household))}
					userId={userId}
				/>
			)}
		</Screen>
	);
}
