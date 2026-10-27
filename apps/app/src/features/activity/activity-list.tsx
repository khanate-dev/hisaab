import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { entryKindLabel } from "@/features/entries/labels";
import { WALLET_TYPE_LABELS } from "@/features/wallets/labels";
import type { ActivityRow } from "@/lib/activity-log";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { isDecimalAmount, isCurrencyCode, parseMoney } from "@hisaab/domain";
import type { WalletType } from "@hisaab/client-schema";

import { LOGGED_FIELDS } from "./fields";

/** What each kind of row is called in the log. */
const THING_LABELS: Record<string, MessageDescriptor> = {
	households: msg`the household`,
	memberships: msg`a Membership`,
	wallets: msg`a Wallet`,
	categories: msg`a Category`,
	entries: msg`an Entry`,
	entry_items: msg`an Item`,
	budgets: msg`a Budget`,
	budget_overrides: msg`a Budget override`,
};

/** Rows named after the Category they're for. */
const FOR_A_CATEGORY: Record<string, boolean> = {
	budgets: true,
	budget_overrides: true,
};

const text = (value: unknown) =>
	value === null || value === undefined
		? "—"
		: typeof value === "string"
			? value
			: JSON.stringify(value);

/** What the log needs to name what rows point at: Wallets (and their currencies) and Categories. */
export type ActivityLookup = {
	wallets: ReadonlyMap<string, { name: string; currency: string }>;
	categories: ReadonlyMap<string, string>;
	/** Budgets are in it, and Items too until Base amounts land (#45). */
	baseCurrency: string | null;
};

type Props = {
	rows: readonly ActivityRow[];
	lookup: ActivityLookup;
	/** Display names of the household's Users, by id. */
	names: ReadonlyMap<string, string>;
	/** Whether a row's Entry can be restored from it: a deletion, the Entry still gone, and the User may write. */
	restorable: (row: ActivityRow) => boolean;
	onRestore: (row: ActivityRow) => void;
};

/** The household's Activity log, newest first: who did what, when, and what changed (spec §3.2). */
export const ActivityList = ({
	rows,
	lookup,
	names,
	restorable,
	onRestore,
}: Props) => {
	const { t, i18n } = useLingui();

	const describe = (row: ActivityRow) => {
		const values = row.after ?? row.before ?? {};
		const thing = THING_LABELS[row.table_name];
		const named =
			row.table_name === "entries"
				? text(values.description) !== "—"
					? text(values.description)
					: i18n._(entryKindLabel(text(values.kind)))
				: FOR_A_CATEGORY[row.table_name] === true
					? (lookup.categories.get(text(values.category_id)) ??
						t`a Category since gone`)
					: text(values.name ?? values.description ?? values.role);
		const what = thing ? i18n._(thing) : t`a record`;
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

	/** A field's value as a person reads it: money in its Wallet's currency, names for what ids point at. */
	const shown = (
		row: ActivityRow,
		column: string,
		values: Record<string, unknown> | null,
	) => {
		const field = LOGGED_FIELDS[row.table_name]?.[column];
		const value = values?.[column];
		if (value === null || value === undefined || !field) return "—";
		const raw = text(value);
		switch (field.kind) {
			case "money": {
				const currency = field.currencyFrom
					? lookup.wallets.get(text(values?.[field.currencyFrom]))?.currency
					: lookup.baseCurrency;
				return currency && isCurrencyCode(currency) && isDecimalAmount(raw)
					? formatMoney(parseMoney(raw, currency))
					: raw;
			}
			case "date":
				return formatDate(raw);
			case "instant":
				return formatDateTime(raw);
			case "wallet":
				return lookup.wallets.get(raw)?.name ?? t`a Wallet since gone`;
			case "category":
				return lookup.categories.get(raw) ?? t`a Category since gone`;
			case "entryKind":
				return i18n._(entryKindLabel(raw));
			case "walletType":
				return Object.hasOwn(WALLET_TYPE_LABELS, raw)
					? i18n._(WALLET_TYPE_LABELS[raw as WalletType])
					: raw;
			default:
				return raw;
		}
	};

	/** The fields an edit changed, among those the log shows. */
	const changes = (row: ActivityRow) =>
		row.action !== "update" || !row.before || !row.after
			? []
			: Object.entries(LOGGED_FIELDS[row.table_name] ?? {}).filter(
					([column]) =>
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
							{changes(row).map(([column, field]) => {
								const label = i18n._(field.label);
								const was = shown(row, column, row.before);
								const now = shown(row, column, row.after);
								return (
									<Text
										key={column}
										variant="muted"
									>
										{t`${label}: ${was} → ${now}`}
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
