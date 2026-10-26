import { addMoney, isNegative, type Money, negateMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { positiveMoney, recordableWallets } from "@/features/entries/draft";
import { useCommonChecks, useSave } from "@/features/entries/form-checks";
import type { WalletChoice } from "@/features/entries/types";
import { formatMoney } from "@/lib/format";

type Props = {
	/** Money Lent comes back into a Wallet; money Borrowed goes back out of one. */
	lent: boolean;
	/** What's outstanding: a Repayment is never more. */
	outstanding: Money;
	wallets: readonly WalletChoice[];
	today: string;
	onSubmit: (repayment: {
		walletId: string;
		amount: string;
		occurredOn: string;
	}) => Promise<void>;
	onCancel: () => void;
};

/**
 * A Repayment (CONTEXT.md): part or all of what's outstanding, to or from a Wallet in the Loan's currency (other
 * currencies join with Base amounts, #45).
 */
export const RepaymentForm = ({
	lent,
	outstanding,
	wallets,
	today,
	onSubmit,
	onCancel,
}: Props) => {
	const { t } = useLingui();
	const checks = useCommonChecks();
	const { busy, error, setError, save } = useSave();
	const { currency } = outstanding;
	const repayable = recordableWallets(wallets, currency);
	const [walletId, setWalletId] = useState(repayable[0]?.id ?? "");
	const [amount, setAmount] = useState("");
	const [occurredOn, setOccurredOn] = useState(today);
	const most = formatMoney(outstanding);

	const submit = async () => {
		const money = positiveMoney(amount, currency);
		if (!money) return setError(t`Enter an amount more than zero, like 500.`);
		if (isNegative(addMoney(outstanding, negateMoney(money))))
			return setError(t`That's more than the ${most} outstanding.`);
		if (!repayable.some((w) => w.id === walletId))
			return setError(t`Pick a Wallet.`);
		const problem = checks({ occurredOn, description: "", notes: "", today });
		if (problem) return setError(problem);
		await save(() =>
			onSubmit({
				walletId,
				amount: amount.trim(),
				occurredOn: occurredOn.trim(),
			}),
		);
	};

	return (
		<View className="gap-3 rounded-control border-2 border-border p-3">
			<RadioGroup
				label={lent ? t`Into Wallet` : t`From Wallet`}
				onValueChange={setWalletId}
				options={repayable.map((w) => ({ value: w.id, label: w.name }))}
				value={walletId}
			/>
			<Input
				hint={t`Up to ${most}.`}
				inputMode="decimal"
				label={t`Repayment (${currency})`}
				onChangeText={setAmount}
				value={amount}
			/>
			<Input
				label={t`Date`}
				onChangeText={setOccurredOn}
				value={occurredOn}
			/>
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			<View className="flex-row flex-wrap gap-2">
				<Button
					disabled={busy}
					onPress={() => void submit()}
				>
					{t`Save Repayment`}
				</Button>
				<Button
					onPress={onCancel}
					variant="secondary"
				>
					{t`Cancel`}
				</Button>
			</View>
		</View>
	);
};
