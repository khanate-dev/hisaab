import type { BudgetVsActualLine, CategoryLike, Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import { useDifference } from "./difference";
import type { Comparison } from "./labels";

/**
 * Budget vs actual (spec §3.5): each budgeted Expense Category's Budgets over the period against what was spent, with
 * Pace (ahead when more is spent than the share of the period gone). Every figure opens the Expenses it counts.
 */
export const BudgetVsActualReport = <T extends CategoryLike>({
	report,
	comparison,
	onDrillDown,
}: {
	report: { lines: BudgetVsActualLine<T>[]; day: number; days: number };
	comparison: Comparison;
	onDrillDown: (categoryId: string) => void;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	const against = (line: { previous: Money; average: Money }) =>
		comparison === "previous" ? line.previous : line.average;
	if (report.lines.length === 0)
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Budgets in this period. Set some on the Budgets tab.`}
			</Text>
		);
	const { day, days } = report;
	return (
		<View className="gap-2">
			<Text variant="muted">{t`Day ${day} of ${days}.`}</Text>
			<View role="list">
				{report.lines.map((line) => {
					const name = line.category.name;
					const actual = formatMoney(line.actual);
					const budget = formatMoney(line.budget);
					const percent = line.percentUsed;
					const versus = difference(line.actual, against(line));
					const status =
						percent === null
							? t`${actual} of ${budget}`
							: line.ahead
								? t`${actual} of ${budget}, ${percent}%, ahead of pace`
								: t`${actual} of ${budget}, ${percent}%`;
					return (
						<Pressable
							accessibilityHint={t`Shows these Expenses`}
							accessibilityLabel={name}
							accessibilityRole="button"
							accessibilityValue={{ text: t`${status}, ${versus}` }}
							className="gap-0.5 border-b-2 border-border py-2"
							key={line.category.id}
							onPress={() => onDrillDown(line.category.id)}
						>
							<View className="flex-row justify-between gap-3">
								<Text variant="label">{name}</Text>
								<Text
									className={line.ahead ? "text-bad" : ""}
									variant="label"
								>
									{t`${actual} of ${budget}`}
								</Text>
							</View>
							<View className="flex-row justify-between gap-3">
								<Text variant="muted">
									{percent === null
										? ""
										: line.ahead
											? t`${percent}%, ahead of pace`
											: t`${percent}%`}
								</Text>
								<Text variant="muted">{versus}</Text>
							</View>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
};
