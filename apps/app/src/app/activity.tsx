import { profiles } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { useMemo } from "react";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { ActivityList } from "@/features/activity/activity-list";
import type { ActivityRow } from "@/features/activity/types";
import {
	useActivityLog,
	useRestoreEntry,
} from "@/features/activity/use-activity";
import { useEntries } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { db } from "@/lib/powersync";
import { useSignedInUserId } from "@/lib/session";

export default function Activity() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const log = useActivityLog(household?.id);
	const restore = useRestoreEntry(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const entries = useEntries(household?.id);
	// The names of everyone the User shares a household with; profiles sync for exactly those (Sync Streams).
	const people = useQuery(toCompilableQuery(db.select().from(profiles))).data;
	const names = useMemo(
		() => new Map(people.map((p) => [p.id, p.display_name])),
		[people],
	);

	// Only a deletion whose Entry is still gone can bring it back, and only the latest one for that Entry.
	const restorable = (row: ActivityRow) =>
		canWrite &&
		row.table_name === "entries" &&
		row.action === "delete" &&
		entries !== undefined &&
		!entries.some((e) => e.id === row.row_id) &&
		log.data?.find((r) => r.row_id === row.row_id && r.action === "delete") ===
			row;

	return (
		<Screen title={t`Activity log`}>
			<Text variant="muted">{t`Every change to the household's data. Nobody can edit it.`}</Text>
			{log.isError ? (
				<View>
					<Text
						role="alert"
						variant="muted"
					>
						{t`The Activity log needs a connection. Try again once you're online.`}
					</Text>
					<Chip onPress={() => void log.refetch()}>{t`Try again`}</Chip>
				</View>
			) : log.data === undefined ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`Loading the Activity log…`}
				</Text>
			) : (
				<ActivityList
					names={names}
					onRestore={(row) => restore.mutate(row.row_id)}
					restorable={restorable}
					rows={log.data}
				/>
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
