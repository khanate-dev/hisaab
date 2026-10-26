import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { entryKindLabel } from "@/features/entries/labels";
import { QUIET_COLUMNS } from "@/lib/activity-columns";
import { formatDateTime } from "@/lib/format";

import type { ActivityRow } from "./types";

/** What each kind of row is called in the log. */
const THING_LABELS: Record<string, MessageDescriptor> = {
	households: msg`the household`,
	memberships: msg`a Membership`,
	wallets: msg`a Wallet`,
	categories: msg`a Category`,
	entries: msg`an Entry`,
	entry_items: msg`an Item`,
};

const text = (value: unknown) =>
	value === null || value === undefined
		? "—"
		: typeof value === "string"
			? value
			: JSON.stringify(value);

type Props = {
	rows: readonly ActivityRow[];
	/** Display names of the household's Users, by id. */
	names: ReadonlyMap<string, string>;
	/** Whether a row's Entry can be restored from it: a deletion, the Entry still gone, and the User may write. */
	restorable: (row: ActivityRow) => boolean;
	onRestore: (row: ActivityRow) => void;
};

/** The household's Activity log, newest first: who did what, when, and what changed (spec §3.2). */
export const ActivityList = ({ rows, names, restorable, onRestore }: Props) => {
	const { t, i18n } = useLingui();

	const describe = (row: ActivityRow) => {
		const values = row.after ?? row.before ?? {};
		const thing = THING_LABELS[row.table_name];
		const named =
			row.table_name === "entries"
				? text(values.description) !== "—"
					? text(values.description)
					: i18n._(entryKindLabel(text(values.kind)))
				: text(values.name ?? values.description ?? values.role);
		const what = thing ? i18n._(thing) : row.table_name;
		const who =
			row.actor_id === null
				? t`Hisaab`
				: (names.get(row.actor_id) ?? t`Someone`);
		return row.action === "insert"
			? t`${who} added ${what}: ${named}`
			: row.action === "update"
				? t`${who} changed ${what}: ${named}`
				: t`${who} deleted ${what}: ${named}`;
	};

	const changes = (row: ActivityRow) =>
		row.action !== "update" || !row.before || !row.after
			? []
			: Object.keys(row.after).filter(
					(column) =>
						!QUIET_COLUMNS.has(column) &&
						text(row.before?.[column]) !== text(row.after?.[column]),
				);

	if (rows.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`Nothing has changed yet.`}
			</Text>
		);
	}

	return (
		<View role="list">
			{rows.map((row) => {
				const description = describe(row);
				const synced = formatDateTime(row.synced_at);
				const made =
					row.device_time === null ? null : formatDateTime(row.device_time);
				return (
					<View
						className="gap-1 border-b-2 border-border py-2"
						key={row.id}
						role="listitem"
					>
						{/* Read as one: what happened, then when and what changed; Restore stays its own button. */}
						<View
							accessibilityLabel={description}
							accessible
							className="gap-1"
						>
							<Text variant="label">{description}</Text>
							<Text variant="muted">
								{made === null || made === synced
									? t`Synced ${synced}`
									: t`Made ${made}, synced ${synced}`}
							</Text>
							{changes(row).map((column) => {
								const was = text(row.before?.[column]);
								const now = text(row.after?.[column]);
								return (
									<Text
										key={column}
										variant="muted"
									>
										{t`${column}: ${was} → ${now}`}
									</Text>
								);
							})}
						</View>
						{restorable(row) && (
							<View className="flex-row">
								<Chip
									accessibilityHint={t`Puts the Entry back as it was when deleted`}
									onPress={() => onRestore(row)}
								>
									{t`Restore`}
								</Chip>
							</View>
						)}
					</View>
				);
			})}
		</View>
	);
};
