import type { Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";
import { PieChart } from "react-native-gifted-charts";

import { formatMoney } from "@/lib/format";
import { useColors } from "@/theme/theme";

import { chartValue } from "./chart-value";

export type DonutSlice = {
	key: string;
	label: string;
	value: Money;
	color: string;
};

/**
 * A donut of shares (ADR-0008: gifted-charts behind our own component). The drawing is for the eye; screen readers
 * get the chart's title and every slice's figure instead.
 */
export const DonutChart = ({
	title,
	slices,
}: {
	title: string;
	slices: readonly DonutSlice[];
}) => {
	const { t } = useLingui();
	const colors = useColors();
	const shown = slices.filter((s) => chartValue(s.value) > 0);
	const summary = shown
		.map((s) => {
			const { label } = s;
			const amount = formatMoney(s.value);
			return t`${label}: ${amount}`;
		})
		.join(", ");
	return (
		<View
			accessibilityLabel={title}
			accessibilityValue={{ text: summary }}
			accessible
			className="items-center"
		>
			{shown.length > 0 && (
				<View
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					<PieChart
						data={shown.map((s) => ({
							value: chartValue(s.value),
							color: s.color,
						}))}
						donut
						innerCircleColor={colors.bg}
						innerRadius={58}
						radius={90}
						strokeColor={colors.bg}
						strokeWidth={2}
					/>
				</View>
			)}
		</View>
	);
};
