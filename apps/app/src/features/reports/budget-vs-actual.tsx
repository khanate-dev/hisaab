import type { BudgetVsActualLine, CategoryLike, Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import { useDifference } from "./difference";
import { UnpricedNote } from "./unpriced-note";
import type { Comparison } from "./labels";

/**
 * Budget vs actual (spec §3.5): each Category's Budgets (and Expected income) over the months of the period it had one,
 * against what was spent (or received) in them, with Pace. Every figure opens the Entries it counts.
 */
export const BudgetVsActualReport = <T extends CategoryLike>({
	report,
	comparison,
	onDrillDown,
}: {
	report: {
		budgets: BudgetVsActualLine<T>[];
		expectedIncome: BudgetVsActualLine<T>[];
		day: number;
		days: number;
		current: boolean;
		unpriced: number;
	};
	comparison: Comparison;
	/** Opens the Entries a line counts: its Category's, of its kind, in its months. */
	onDrillDown: (line: BudgetVsActualLine<T>) => void;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	const against = (line: { previous: Money; average: Money }) =>
		comparison === "previous" ? line.previous : line.average;
	if (report.budgets.length === 0 && report.expectedIncome.length === 0)
		return (
			<View className="gap-2">
				<Text
					role="status"
					variant="muted"
				>
					{t`No Budgets in this period. Set some on the Budgets tab.`}
				</Text>
				<UnpricedNote count={report.unpriced} />
			</View>
		);
	const { day, days } = report;
	const section = (
		title: string,
		lines: BudgetVsActualLine<T>[],
		spending: boolean,
	) =>
		lines.length === 0 ? null : (
			<View className="gap-1">
				<Text variant="title">{title}</Text>
				<View role="list">
					{lines.map((line) => {
						const name = line.category.name;
						const actual = formatMoney(line.actual);
						const budget = formatMoney(line.budget);
						const percent = line.percentUsed;
						const versus = difference(line.actual, against(line));
						// Ahead of pace is a warning for spending, and good news for income.
						const warn = spending && line.ahead;
						const status =
							percent === null
								? t`${actual} of ${budget}`
								: line.ahead
									? t`${actual} of ${budget}, ${percent}%, ahead of pace`
									: t`${actual} of ${budget}, ${percent}%`;
						return (
							<Pressable
								accessibilityHint={
									spending ? t`Shows these Expenses` : t`Shows these Incomes`
								}
								accessibilityLabel={name}
								accessibilityRole="button"
								accessibilityValue={{ text: t`${status}, ${versus}` }}
								className="gap-0.5 border-b-2 border-border py-2"
								key={line.category.id}
								onPress={() => onDrillDown(line)}
							>
								<View className="flex-row justify-between gap-3">
									<Text variant="label">{name}</Text>
									<Text
										className={warn ? "text-bad" : ""}
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
	return (
		<View className="gap-4">
			{report.current && (
				<Text variant="muted">{t`Day ${day} of ${days}.`}</Text>
			)}
			<UnpricedNote count={report.unpriced} />
			{section(t`Budgets`, report.budgets, true)}
			{section(t`Expected income`, report.expectedIncome, false)}
		</View>
	);
};
