import type { Money } from "@hisaab/domain";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { BarChart } from "@/components/charts/bar-chart";
import { Text } from "@/components/ui/text";
import { useDifference } from "@/features/reports/difference";
import type { Comparison } from "@/features/reports/labels";
import { UnpricedNote } from "@/features/reports/unpriced-note";
import { formatBudgetMonth, formatMoney } from "@/lib/format";

type Flow = { income: Money; expense: Money; net: Money };

/** One figure, said with what it's compared with. */
const Figure = ({
	label,
	value,
	versus,
	big = false,
}: {
	label: string;
	value: string;
	versus: string;
	big?: boolean;
}) => {
	const { t } = useLingui();
	return (
		<View
			accessibilityLabel={label}
			accessibilityValue={{ text: t`${value}, ${versus}` }}
			accessible
			className="flex-row items-center justify-between gap-3"
		>
			<Text variant="label">{label}</Text>
			<View className="items-end">
				<Text variant={big ? "figure" : "label"}>{value}</Text>
				<Text variant="muted">{versus}</Text>
			</View>
		</View>
	);
};

/**
 * My overview (spec §3.5): the User's net worth and income vs expense across every household they belong to, in their
 * display currency, "approx." when other currencies were converted. Cross-household transfers cancel out.
 */
export const MyOverview = ({
	overview,
	comparison,
	monthStart,
}: {
	overview: {
		approximate: boolean;
		unconverted: number;
		unpriced: number;
		worth: {
			total: Money;
			previous: Money;
			average: Money;
			months: { month: string; total: Money }[];
		};
		flow: { total: Flow; previous: Flow; average: Flow };
	};
	comparison: Comparison;
	monthStart: (month: string) => string;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	const { approximate, unconverted, worth, flow } = overview;
	const shown = (money: Money) => {
		const amount = formatMoney(money);
		return approximate ? t`approx. ${amount}` : amount;
	};
	const pick = <T,>(of: { previous: T; average: T }) =>
		comparison === "previous" ? of.previous : of.average;
	const then = pick(flow);
	return (
		<View className="gap-4">
			<Figure
				big
				label={t`Net worth`}
				value={shown(worth.total)}
				versus={difference(worth.total, pick(worth))}
			/>
			<Figure
				label={t`Came in`}
				value={shown(flow.total.income)}
				versus={difference(flow.total.income, then.income)}
			/>
			<Figure
				label={t`Went out`}
				value={shown(flow.total.expense)}
				versus={difference(flow.total.expense, then.expense)}
			/>
			<Figure
				label={t`Left over`}
				value={shown(flow.total.net)}
				versus={difference(flow.total.net, then.net)}
			/>
			{approximate && (
				<Text variant="muted">
					{t`Other currencies are converted at the latest rates, so these figures are approximate.`}
				</Text>
			)}
			{unconverted > 0 && (
				<Text variant="muted">
					{t`${plural(unconverted, { one: "# Wallet or household isn't", other: "# Wallets or households aren't" })} counted: no exchange rate is held for its currency yet.`}
				</Text>
			)}
			<UnpricedNote count={overview.unpriced} />
			<BarChart
				bars={worth.months.map((m) => ({
					key: m.month,
					label: formatBudgetMonth(monthStart(m.month)),
					value: m.total,
				}))}
				title={t`Net worth at each month's end`}
			/>
		</View>
	);
};
