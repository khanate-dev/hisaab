import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { ActivityList } from "@/features/activity/activity-list";
import {
	useActivityLog,
	useRestoreEntry,
} from "@/features/activity/use-activity";
import { useCategories } from "@/features/categories/use-categories";
import { useEntries } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { usePeopleNames } from "@/features/members/use-people-names";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import type { ActivityRow } from "@/lib/activity-log";
import { useSignedInUserId } from "@/lib/session";

export default function Activity() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const log = useActivityLog(household?.id);
	const restore = useRestoreEntry(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const entries = useEntries(household?.id);
	const wallets = useWalletRows(household?.id);
	const categories = useCategories(household?.id);
	// The names of everyone the User shares a household with, and of its Former members.
	const names = usePeopleNames();
	const lookup = useMemo(
		() => ({
			wallets: new Map(
				(wallets ?? []).map((w) => [
					w.id,
					{ name: w.name, currency: w.currency },
				]),
			),
			categories: new Map((categories ?? []).map((c) => [c.id, c.name])),
			baseCurrency: household?.base_currency ?? null,
		}),
		[wallets, categories, household?.base_currency],
	);
	const rows = useMemo(() => log.data?.pages.flat(), [log.data]);

	// Only a deletion whose Entry is still gone can bring it back, and only the latest one for that Entry.
	const restorable = (row: ActivityRow) =>
		canWrite &&
		row.table_name === "entries" &&
		row.action === "delete" &&
		// A Loan's principal comes back only with its Loan, and a cross-household transfer never one half at a time.
		row.before?.kind !== "loan_principal" &&
		row.before?.kind !== "household_transfer" &&
		entries !== undefined &&
		!entries.some((e) => e.id === row.row_id) &&
		rows?.find((r) => r.row_id === row.row_id && r.action === "delete") === row;

	return (
		<Screen title={t`Activity log`}>
			<Text variant="muted">{t`Every change to the household's data. Nobody can edit it.`}</Text>
			{log.isError ? (
				<View className="gap-2">
					<Text
						role="alert"
						variant="muted"
					>
						{t`The Activity log needs a connection. Try again once you're online.`}
					</Text>
					<Chip onPress={() => void log.refetch()}>{t`Try again`}</Chip>
				</View>
			) : rows === undefined ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`Loading the Activity log…`}
				</Text>
			) : (
				<>
					<ActivityList
						lookup={lookup}
						names={names}
						onRestore={(row) => restore.mutate(row.row_id)}
						restorable={restorable}
						rows={rows}
					/>
					{log.hasNextPage && (
						<Chip
							disabled={log.isFetchingNextPage}
							onPress={() => void log.fetchNextPage()}
						>
							{t`Show older changes`}
						</Chip>
					)}
				</>
			)}
			{restore.isError && (
				<Text
					className="text-bad"
					role="alert"
				>
					{t`That Entry couldn't be restored. Try again once you're online.`}
				</Text>
			)}
		</Screen>
	);
}
