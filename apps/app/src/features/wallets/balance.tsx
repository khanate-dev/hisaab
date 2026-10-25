import type { WalletType } from "@hisaab/client-schema";
import { isNegative, isZero, type Money, negateMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

type Reading = {
	/** The figure people see: what a Credit card owes is shown as a positive amount. */
	shown: Money;
	kind: "owed" | "in_credit" | "below_zero" | null;
};

/**
 * A Wallet's Balance as people read it (spec §3.2). A Credit card is a liability: below zero is what's owed, not a
 * problem. Any other Wallet may go below zero; that's flagged, never blocked.
 */
const read = (type: WalletType, balance: Money): Reading => {
	const negative = isNegative(balance);
	if (type !== "credit_card")
		return { shown: balance, kind: negative ? "below_zero" : null };
	if (negative) return { shown: negateMoney(balance), kind: "owed" };
	return { shown: balance, kind: isZero(balance) ? null : "in_credit" };
};

/** A Balance with its note; `compact` for a balance history row. */
export const Balance = ({
	type,
	balance,
	compact = false,
}: {
	type: WalletType;
	balance: Money;
	compact?: boolean;
}) => {
	const { t } = useLingui();
	const { shown, kind } = read(type, balance);
	const tone = kind === "below_zero" ? "text-bad" : "";
	const caption =
		kind === "owed"
			? t`Owed`
			: kind === "in_credit"
				? t`In credit`
				: kind === "below_zero"
					? t`Below zero`
					: null;

	return (
		<View
			className={compact ? "flex-row items-baseline gap-2" : "items-end gap-1"}
		>
			<Text
				className={`max-w-full shrink break-all text-end ${tone}`}
				variant={compact ? "muted" : "figure"}
			>
				{formatMoney(shown)}
			</Text>
			{caption !== null && (
				<Text
					className={tone}
					variant={compact ? "muted" : "label"}
				>
					{caption}
				</Text>
			)}
		</View>
	);
};
