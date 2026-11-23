import type { Money, WalletWorth } from "@hisaab/domain";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { BarChart } from "@/components/charts/bar-chart";
import { Text } from "@/components/ui/text";
import { formatBudgetMonth, formatMoney } from "@/lib/format";

import { useDifference } from "./difference";
import type { Comparison } from "./labels";

type Wallet = {
	id: string;
	name: string;
	currency: string;
	archived_at: string | null;
};

/**
 * Net worth (spec §3.5): every Wallet's Balance at the period's end (or today), converted to the Base currency at the
 * latest rates, against the previous period's end or the 3-month average, month by month. Every figure opens the
 * Entries that make it.
 */
export const NetWorthReport = <W extends Wallet>({
	report,
	comparison,
	monthStart,
	onDrillDown,
	partial,
}: {
	/** Counting only some members' Entries: each Wallet's Balance is only theirs. */
	partial: boolean;
	report: {
		total: Money;
		previous: Money;
		average: Money;
		wallets: WalletWorth<W>[];
		unconverted: number;
		months: { month: string; total: Money }[];
	};
	comparison: Comparison;
	monthStart: (month: string) => string;
	/** Opens the Entries up to the date: one Wallet's, or every Wallet's. */
	onDrillDown: (walletId?: string) => void;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	const total = formatMoney(report.total);
	const versus = difference(
		report.total,
		comparison === "previous" ? report.previous : report.average,
	);
	// Archived Wallets only while they still hold something.
	const shown = report.wallets.filter(
		(w) => w.wallet.archived_at === null || !w.balance.isZero(),
	);
	const { unconverted } = report;
	return (
		<View className="gap-4">
			<Pressable
				accessibilityHint={t`Shows these Entries`}
				accessibilityLabel={t`Net worth`}
				accessibilityRole="button"
				accessibilityValue={{ text: t`${total}, ${versus}` }}
				onPress={() => onDrillDown()}
			>
				<Text variant="muted">{t`Net worth`}</Text>
				<Text variant="figure">{total}</Text>
				<Text variant="muted">{versus}</Text>
			</Pressable>
			{partial && (
				<Text variant="muted">
					{t`Only the picked members' Entries count, so each Balance is what theirs came to.`}
				</Text>
			)}
			{unconverted > 0 && (
				<Text variant="muted">
					{t`${plural(unconverted, { one: "# Wallet isn't", other: "# Wallets aren't" })} counted: no exchange rate is held for ${plural(unconverted, { one: "its currency", other: "their currencies" })} yet.`}
				</Text>
			)}
			<BarChart
				bars={report.months.map((m) => ({
					key: m.month,
					label: formatBudgetMonth(monthStart(m.month)),
					value: m.total,
				}))}
				title={t`At each month's end`}
			/>
			<View role="list">
				{shown.map(({ wallet, balance, value }) => {
					const name = wallet.name;
					const own = formatMoney(balance);
					const converted = value === null ? null : formatMoney(value);
					const read =
						converted === null || value?.currency === balance.currency
							? own
							: t`${own}, about ${converted}`;
					return (
						<Pressable
							accessibilityHint={t`Shows this Wallet's Entries`}
							accessibilityLabel={name}
							accessibilityRole="button"
							accessibilityValue={{ text: read }}
							className="flex-row justify-between gap-3 border-b-2 border-border py-2"
							key={wallet.id}
							onPress={() => onDrillDown(wallet.id)}
						>
							<Text variant="label">{name}</Text>
							<View className="items-end">
								<Text variant="label">{own}</Text>
								{converted !== null && value?.currency !== balance.currency && (
									<Text variant="muted">{t`about ${converted}`}</Text>
								)}
							</View>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
};
