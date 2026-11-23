import {
	addMoney,
	type CategoryLike,
	isNegative,
	isZero,
	type Money,
	negateMoney,
	type SpendingByCategory,
} from "@hisaab/domain";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";
import { categoryColor } from "@/theme/tokens";

import type { Comparison } from "./labels";

type Category = CategoryLike & { color: string };

/** How a figure stands against what it's compared with, in words: "PKR 200 more", "PKR 50 less", "The same". */
const useDifference = () => {
	const { t } = useLingui();
	return (now: Money, then: Money) => {
		const gap = addMoney(now, negateMoney(then));
		if (isZero(gap)) return t`The same`;
		const amount = formatMoney(isNegative(gap) ? negateMoney(gap) : gap);
		return isNegative(gap) ? t`${amount} less` : t`${amount} more`;
	};
};

/**
 * Spending by category (spec §3.5): the period's total against what it's compared with, a donut of the top-level
 * Categories, and each one's figure, Subcategories under it. Every figure opens the Entries it counts.
 */
export const SpendingByCategoryReport = <T extends Category>({
	report,
	comparison,
	onDrillDown,
	today,
}: {
	report: SpendingByCategory<T>;
	comparison: Comparison;
	/** The household's today: a period running past it is only so far. */
	today: string;
	/** Opens the Entries a figure counts: one Category's, or all of them. */
	onDrillDown: (categoryId?: string) => void;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	const against = (line: { previous: Money; average: Money }) =>
		comparison === "previous" ? line.previous : line.average;
	const total = formatMoney(report.total);
	const totalAgainst = difference(
		report.total,
		comparison === "previous" ? report.previousTotal : report.averageTotal,
	);
	const spent = report.lines.filter((line) => !isZero(line.amount));
	const { unpriced } = report;

	const unpricedNote =
		unpriced > 0 ? (
			<Text variant="muted">
				{t`${plural(unpriced, { one: "# Expense in another currency isn't", other: "# Expenses in other currencies aren't" })} counted yet: no exchange rate is held for ${plural(unpriced, { one: "its date", other: "their dates" })}.`}
			</Text>
		) : null;
	if (report.lines.length === 0)
		return (
			<View className="gap-2">
				<Text
					role="status"
					variant="muted"
				>
					{t`No Expenses in this period.`}
				</Text>
				{unpricedNote}
			</View>
		);

	return (
		<View className="gap-4">
			<Pressable
				accessibilityHint={t`Shows these Expenses`}
				accessibilityLabel={t`Total spent`}
				accessibilityRole="button"
				accessibilityValue={{ text: t`${total}, ${totalAgainst}` }}
				className="gap-0.5"
				onPress={() => onDrillDown()}
			>
				<Text variant="muted">{t`Total spent`}</Text>
				<Text variant="figure">{total}</Text>
				<Text variant="muted">{totalAgainst}</Text>
				{report.period.last > today && (
					<Text variant="muted">{t`So far: the period runs past today.`}</Text>
				)}
			</Pressable>
			<BarChart
				bars={[
					{ key: "now", label: t`This period`, value: report.total },
					{ key: "previous", label: t`Previous`, value: report.previousTotal },
					{
						key: "average",
						label: t`3-month avg.`,
						value: report.averageTotal,
					},
				]}
				title={t`Total spent, compared`}
			/>
			<DonutChart
				slices={spent.map((line) => ({
					key: line.category.id,
					label: line.category.name,
					value: line.amount,
					color: categoryColor(line.category.color),
				}))}
				title={t`Spending by category`}
			/>
			{unpricedNote}
			<View role="list">
				{report.lines.map((line) => {
					const name = line.category.name;
					const amount = formatMoney(line.amount);
					const versus = difference(line.amount, against(line));
					return (
						<View
							className="gap-1 border-b-2 border-border py-2"
							key={line.category.id}
						>
							<Pressable
								accessibilityHint={t`Shows these Expenses`}
								accessibilityLabel={name}
								accessibilityRole="button"
								accessibilityValue={{ text: t`${amount}, ${versus}` }}
								className="flex-row items-center justify-between gap-3"
								onPress={() => onDrillDown(line.category.id)}
							>
								<View className="flex-row items-center gap-2">
									<View
										className="h-3 w-3 rounded-full"
										style={{
											backgroundColor: categoryColor(line.category.color),
										}}
									/>
									<Text variant="label">{name}</Text>
								</View>
								<View className="items-end">
									<Text variant="label">{amount}</Text>
									<Text variant="muted">{versus}</Text>
								</View>
							</Pressable>
							{line.subcategories.map((sub) => {
								const subName = sub.category.name;
								const subAmount = formatMoney(sub.amount);
								return (
									<Pressable
										accessibilityHint={t`Shows these Expenses`}
										accessibilityLabel={subName}
										accessibilityRole="button"
										accessibilityValue={{ text: subAmount }}
										className="flex-row justify-between ps-5"
										key={sub.category.id}
										onPress={() => onDrillDown(sub.category.id)}
									>
										<Text variant="muted">{subName}</Text>
										<Text variant="muted">{subAmount}</Text>
									</Pressable>
								);
							})}
						</View>
					);
				})}
			</View>
		</View>
	);
};
