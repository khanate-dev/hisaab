import type { WalletType } from "@hisaab/client-schema";
import { isNegative, isZero, type Money, negateMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

/**
 * A Wallet's Balance as people read it (spec §3.2). A Credit card is a liability: below zero is what's owed, not a
 * problem. Any other Wallet may go below zero; that's flagged, never blocked.
 */
export const Balance = ({
	type,
	balance,
}: {
	type: WalletType;
	balance: Money;
}) => {
	const { t } = useLingui();
	const card = type === "credit_card";
	const negative = isNegative(balance);
	const caption = card
		? negative
			? t`Owed`
			: isZero(balance)
				? null
				: t`In credit`
		: negative
			? t`Below zero`
			: null;

	return (
		<View className="items-end gap-1">
			<Text
				className={`max-w-full shrink break-all text-end ${negative && !card ? "text-bad" : ""}`}
				variant="figure"
			>
				{formatMoney(card && negative ? negateMoney(balance) : balance)}
			</Text>
			{caption !== null && (
				<Text
					className={negative && !card ? "text-bad" : ""}
					variant="label"
				>
					{caption}
				</Text>
			)}
		</View>
	);
};
