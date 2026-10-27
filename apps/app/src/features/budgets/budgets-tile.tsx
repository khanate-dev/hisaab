import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import { type BudgetLine, topBudgets } from "./month-view";

const TOP = 3;

/** Home's Budgets tile: this Budget month's three most-used Budgets; it opens the Budgets tab. */
export const BudgetsTile = ({
	budgets,
	onOpen,
}: {
	budgets: readonly BudgetLine[];
	onOpen: () => void;
}) => {
	const { t } = useLingui();
	if (budgets.length === 0) return null;
	return (
		<Card
			accessibilityHint={t`Opens your Budgets`}
			onPress={onOpen}
		>
			<Text variant="title">{t`Budgets`}</Text>
			<View className="gap-1">
				{topBudgets(budgets, TOP).map(
					({ category, used, budget, percentUsed }) => {
						const { name } = category;
						const spent = formatMoney(used);
						const of = formatMoney(budget);
						return (
							<Text
								key={category.id}
								variant="label"
							>
								{percentUsed === null
									? t`${name}: ${spent} of ${of}`
									: t`${name}: ${spent} of ${of}, ${percentUsed}%`}
							</Text>
						);
					},
				)}
			</View>
		</Card>
	);
};
