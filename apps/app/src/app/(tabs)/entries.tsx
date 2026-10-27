import { ENTRY_KINDS } from "@hisaab/client-schema";
import {
	type EntryFilter,
	filterEntries,
	NO_FILTER,
	readSavedCriteria,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
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
import { useMembers } from "@/features/members/use-members";
import { deleteSavedFilter, saveFilter } from "@/features/search/actions";
import { EntrySearch } from "@/features/search/entry-search";
import { toSearchable } from "@/features/search/searchable";
import { useSavedFilters } from "@/features/search/use-saved-filters";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { useSignedInUserId } from "@/lib/session";

/** One household's Entries with their search: a household switch starts it afresh (spec §3.4). */
const SearchableEntries = ({
	householdId,
	userId,
}: {
	householdId: string;
	userId: string;
}) => {
	const { t, i18n } = useLingui();
	const views = useEntryViews(householdId);
	const categories = useCategories(householdId);
	const wallets = useWalletRows(householdId);
	const members = useMembers(householdId);
	const saved = useSavedFilters(householdId, userId);
	const title = useEntryTitle();
	const [filter, setFilter] = useState<EntryFilter>(NO_FILTER);

	const parentOf = useMemo(
		() => new Map((categories ?? []).map((c) => [c.id, c.parent_id])),
		[categories],
	);
	const shown = useMemo(
		() =>
			views === undefined
				? undefined
				: filterEntries(
						views,
						(v) => toSearchable(v, title(v), parentOf),
						filter,
					),
		[views, filter, parentOf, title],
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
			members: (members ?? []).map((m) => ({
				value: m.userId,
				label: m.name ?? t`Someone`,
			})),
		};
	}, [categories, wallets, members, i18n, t]);
	const savedFilters = useMemo(
		() =>
			(saved ?? []).map((s) => ({
				id: s.id,
				name: s.name,
				filter: readSavedCriteria(s.criteria),
			})),
		[saved],
	);

	if (shown === undefined || views === undefined) return null;
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
				total={views.length}
			/>
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
			{household && (
				<SearchableEntries
					householdId={household.id}
					key={household.id}
					userId={userId}
				/>
			)}
		</Screen>
	);
}
