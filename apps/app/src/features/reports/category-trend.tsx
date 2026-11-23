import type { CategoryLike, Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { BarChart } from "@/components/charts/bar-chart";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { formatBudgetMonth, formatMoney } from "@/lib/format";

import { useDifference } from "./difference";
import { UnpricedNote } from "./unpriced-note";
import type { Comparison } from "./labels";

/**
 * Category trend (spec §3.5): one Category, Subcategories included, Budget month by Budget month, its total against the
 * previous period or the 3-month average. Every figure opens the Entries it counts.
 */
export const CategoryTrendReport = <T extends CategoryLike>({
	choices,
	chosen,
	onChoose,
	report,
	comparison,
	monthStart,
	onDrillDown,
}: {
	/** The Categories it can follow: the top-level ones, Expense then Income. */
	choices: readonly T[];
	chosen: string | undefined;
	onChoose: (categoryId: string) => void;
	report:
		| {
				category: T;
				unpriced: number;
				months: { month: string; amount: Money }[];
				total: Money;
				previous: Money;
				average: Money;
		  }
		| undefined;
	comparison: Comparison;
	monthStart: (month: string) => string;
	onDrillDown: (categoryId: string, month?: string) => void;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	return (
		<View className="gap-4">
			<RadioGroup
				label={t`Category`}
				onValueChange={onChoose}
				options={choices.map((c) => ({ value: c.id, label: c.name }))}
				value={chosen ?? ""}
			/>
			{report === undefined ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`Pick a Category to follow.`}
				</Text>
			) : (
				<>
					<Pressable
						accessibilityHint={t`Shows these Entries`}
						accessibilityLabel={t`Total`}
						accessibilityRole="button"
						accessibilityValue={{
							text: (() => {
								const total = formatMoney(report.total);
								const versus = difference(
									report.total,
									comparison === "previous" ? report.previous : report.average,
								);
								return t`${total}, ${versus}`;
							})(),
						}}
						onPress={() => onDrillDown(report.category.id)}
					>
						<Text variant="muted">{t`Total`}</Text>
						<Text variant="figure">{formatMoney(report.total)}</Text>
						<Text variant="muted">
							{difference(
								report.total,
								comparison === "previous" ? report.previous : report.average,
							)}
						</Text>
					</Pressable>
					<UnpricedNote count={report.unpriced} />
					<BarChart
						bars={report.months.map((m) => ({
							key: m.month,
							label: formatBudgetMonth(monthStart(m.month)),
							value: m.amount,
						}))}
						title={t`Month by month`}
					/>
					<View role="list">
						{report.months.map((m) => {
							const name = formatBudgetMonth(monthStart(m.month));
							const amount = formatMoney(m.amount);
							return (
								<Pressable
									accessibilityHint={t`Shows these Entries`}
									accessibilityLabel={name}
									accessibilityRole="button"
									accessibilityValue={{ text: amount }}
									className="flex-row justify-between border-b-2 border-border py-2"
									key={m.month}
									onPress={() => onDrillDown(report.category.id, m.month)}
								>
									<Text variant="label">{name}</Text>
									<Text variant="label">{amount}</Text>
								</Pressable>
							);
						})}
					</View>
				</>
			)}
		</View>
	);
};
