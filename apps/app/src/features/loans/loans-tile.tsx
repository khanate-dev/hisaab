import { addMoney, type Money, zeroMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import type { LoanView } from "./use-loans";

/** What's outstanding on Loans one way, per currency. */
const totals = (loans: readonly LoanView[]) => {
	const byCurrency = new Map<string, Money>();
	for (const { currency, outstanding } of loans)
		byCurrency.set(
			currency,
			addMoney(byCurrency.get(currency) ?? zeroMoney(currency), outstanding),
		);
	return [...byCurrency.values()].map(formatMoney).join(" · ");
};

/** Home's Loans tile (Navigation ticket): shown only while a Loan is outstanding; it opens the Loans list. */
export const LoansTile = ({
	loans,
	onOpen,
}: {
	loans: readonly LoanView[];
	onOpen: () => void;
}) => {
	const { t } = useLingui();
	const open = loans.filter((loan) => !loan.settled);
	if (open.length === 0) return null;
	const owedToYou = open.filter((loan) => loan.loan.direction === "lent");
	const youOwe = open.filter((loan) => loan.loan.direction === "borrowed");
	const owedTotal = totals(owedToYou);
	const oweTotal = totals(youOwe);
	return (
		<Card
			accessibilityHint={t`Opens your Loans`}
			onPress={onOpen}
		>
			<Text variant="title">{t`Loans`}</Text>
			<View className="gap-1">
				{owedToYou.length > 0 && (
					<Text variant="label">{t`Owed to you: ${owedTotal}`}</Text>
				)}
				{youOwe.length > 0 && (
					<Text variant="label">{t`You owe: ${oweTotal}`}</Text>
				)}
			</View>
		</Card>
	);
};
