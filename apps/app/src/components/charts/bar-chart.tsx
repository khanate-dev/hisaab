import type { Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";
import { BarChart as GiftedBarChart } from "react-native-gifted-charts";

import { formatMoney } from "@/lib/format";
import { useColors } from "@/theme/theme";

import { chartValue } from "./chart-value";

const TRANSPARENT = "transparent";

export type Bar = { key: string; label: string; value: Money; color?: string };

/**
 * Bars side by side, one per figure (ADR-0008: gifted-charts behind our own component). The drawing is for the eye;
 * screen readers get the chart's title and every bar's figure instead.
 */
export const BarChart = ({
	title,
	bars,
}: {
	title: string;
	bars: readonly Bar[];
}) => {
	const { t } = useLingui();
	const colors = useColors();
	const summary = bars
		.map((b) => {
			const { label } = b;
			const amount = formatMoney(b.value);
			return t`${label}: ${amount}`;
		})
		.join(", ");
	return (
		<View
			accessibilityLabel={title}
			accessibilityValue={{ text: summary }}
			accessible
		>
			<View
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			>
				<GiftedBarChart
					barBorderRadius={6}
					barWidth={36}
					data={bars.map((b) => ({
						value: chartValue(b.value),
						label: b.label,
						frontColor: b.color ?? colors.primary,
					}))}
					disableScroll
					hideRules
					hideYAxisText
					noOfSections={3}
					spacing={20}
					xAxisColor={colors.border}
					xAxisLabelTextStyle={{ color: colors.muted, fontSize: 12 }}
					yAxisColor={TRANSPARENT}
					yAxisThickness={0}
				/>
			</View>
		</View>
	);
};
