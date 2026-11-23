import type { FlowMonth, Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { BarChart } from "@/components/charts/bar-chart";
import { Text } from "@/components/ui/text";
import { formatBudgetMonth, formatMoney } from "@/lib/format";
import { useColors } from "@/theme/theme";

import { useDifference } from "./difference";
import { UnpricedNote } from "./unpriced-note";
import type { Comparison } from "./labels";

const INCOME = "income" as const;
const EXPENSE = "expense" as const;

type Flow = { income: Money; expense: Money; net: Money };

/**
 * Income vs expense (spec §3.5): what came in, went out and was left over the period and in each Budget month, against
 * the previous period or the 3-month average. Every figure opens the Incomes or Expenses it counts.
 */
export const IncomeVsExpenseReport = ({
	report,
	comparison,
	monthStart,
	onDrillDown,
}: {
	report: {
		unpriced: number;
		months: FlowMonth[];
		total: Flow;
		previous: Flow;
		average: Flow;
	};
	comparison: Comparison;
	/** A Budget month's first day, to name it. */
	monthStart: (month: string) => string;
	/** Opens the Incomes or Expenses (or both, for what was left) of the period, or of one Budget month. */
	onDrillDown: (kinds: ("income" | "expense")[], month?: string) => void;
}) => {
	const { t } = useLingui();
	const colors = useColors();
	const difference = useDifference();
	const then = comparison === "previous" ? report.previous : report.average;
	const rows = [
		{
			kind: "income" as const,
			label: t`Came in`,
			now: report.total.income,
			then: then.income,
		},
		{
			kind: "expense" as const,
			label: t`Went out`,
			now: report.total.expense,
			then: then.expense,
		},
	];
	const left = formatMoney(report.total.net);
	const leftVersus = difference(report.total.net, then.net);

	return (
		<View className="gap-4">
			{rows.map((row) => {
				const amount = formatMoney(row.now);
				const versus = difference(row.now, row.then);
				return (
					<Pressable
						accessibilityHint={t`Shows these Entries`}
						accessibilityLabel={row.label}
						accessibilityRole="button"
						accessibilityValue={{ text: t`${amount}, ${versus}` }}
						className="flex-row items-center justify-between gap-3"
						key={row.kind}
						onPress={() => onDrillDown([row.kind])}
					>
						<Text variant="label">{row.label}</Text>
						<View className="items-end">
							<Text variant="label">{amount}</Text>
							<Text variant="muted">{versus}</Text>
						</View>
					</Pressable>
				);
			})}
			<Pressable
				accessibilityHint={t`Shows these Entries`}
				accessibilityLabel={t`Left over`}
				accessibilityRole="button"
				accessibilityValue={{ text: t`${left}, ${leftVersus}` }}
				className="flex-row items-center justify-between gap-3"
				onPress={() => onDrillDown([INCOME, EXPENSE])}
			>
				<Text variant="label">{t`Left over`}</Text>
				<View className="items-end">
					<Text variant="figure">{left}</Text>
					<Text variant="muted">{leftVersus}</Text>
				</View>
			</Pressable>
			<UnpricedNote count={report.unpriced} />
			<BarChart
				bars={report.months.flatMap((m) => {
					const name = formatBudgetMonth(monthStart(m.month));
					return [
						{
							key: `${m.month} in`,
							label: t`${name} in`,
							value: m.income,
							color: colors.lime,
						},
						{
							key: `${m.month} out`,
							label: t`${name} out`,
							value: m.expense,
							color: colors.primary,
						},
					];
				})}
				title={t`Each month, in and out`}
			/>
			<View role="list">
				{report.months.map((m) => {
					const name = formatBudgetMonth(monthStart(m.month));
					const income = formatMoney(m.income);
					const expense = formatMoney(m.expense);
					const net = formatMoney(m.net);
					return (
						<View
							className="gap-1 border-b-2 border-border py-2"
							key={m.month}
						>
							<Text variant="label">{name}</Text>
							<Pressable
								accessibilityHint={t`Shows these Incomes`}
								accessibilityLabel={t`${name}, came in`}
								accessibilityRole="button"
								accessibilityValue={{ text: income }}
								className="flex-row justify-between"
								onPress={() => onDrillDown([INCOME], m.month)}
							>
								<Text variant="muted">{t`Came in`}</Text>
								<Text variant="muted">{income}</Text>
							</Pressable>
							<Pressable
								accessibilityHint={t`Shows these Expenses`}
								accessibilityLabel={t`${name}, went out`}
								accessibilityRole="button"
								accessibilityValue={{ text: expense }}
								className="flex-row justify-between"
								onPress={() => onDrillDown([EXPENSE], m.month)}
							>
								<Text variant="muted">{t`Went out`}</Text>
								<Text variant="muted">{expense}</Text>
							</Pressable>
							<Pressable
								accessibilityHint={t`Shows these Entries`}
								accessibilityLabel={t`${name}, left over`}
								accessibilityRole="button"
								accessibilityValue={{ text: net }}
								className="flex-row justify-between"
								onPress={() => onDrillDown([INCOME, EXPENSE], m.month)}
							>
								<Text variant="muted">{t`Left over`}</Text>
								<Text variant="muted">{net}</Text>
							</Pressable>
						</View>
					);
				})}
			</View>
		</View>
	);
};
