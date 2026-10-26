import {
	addMoney,
	isCalendarDate,
	isNegative,
	type Money,
	negateMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { orNull, positiveMoney } from "@/features/entries/draft";
import { useSave } from "@/features/entries/form-checks";
import { formatMoney } from "@/lib/format";

import type { LoanView } from "./use-loans";

type Props = {
	view: LoanView;
	onSubmit: (changes: {
		amount: string;
		dueOn: string | null;
		notes: string | null;
	}) => Promise<void>;
	onCancel: () => void;
};

/** A Loan's own details: how much was Lent or Borrowed (never less than what's been repaid), when it's due, notes. */
export const LoanEditForm = ({ view, onSubmit, onCancel }: Props) => {
	const { t } = useLingui();
	const { busy, error, setError, save } = useSave();
	const { currency, principalAmount, outstanding } = view;
	const [amount, setAmount] = useState(principalAmount.toString());
	const [dueOn, setDueOn] = useState(view.loan.due_on ?? "");
	const [notes, setNotes] = useState(view.loan.notes ?? "");
	// What's been repaid so far: the principal can't go below it.
	const repaid: Money = addMoney(principalAmount, negateMoney(outstanding));
	const repaidText = formatMoney(repaid);

	const submit = async () => {
		const money = positiveMoney(amount, currency);
		if (!money) return setError(t`Enter an amount more than zero, like 1500.`);
		if (isNegative(addMoney(money, negateMoney(repaid))))
			return setError(
				t`It can't be less than the ${repaidText} already repaid.`,
			);
		const due = orNull(dueOn);
		if (due !== null && !isCalendarDate(due))
			return setError(t`Enter the due date as YYYY-MM-DD, or leave it empty.`);
		if (notes.trim().length > 1000)
			return setError(t`Keep the notes to 1000 characters or fewer.`);
		await save(() =>
			onSubmit({ amount: amount.trim(), dueOn: due, notes: orNull(notes) }),
		);
	};

	return (
		<View className="gap-3 rounded-control border-2 border-border p-3">
			<Input
				inputMode="decimal"
				label={
					view.loan.direction === "lent"
						? t`Lent (${currency})`
						: t`Borrowed (${currency})`
				}
				onChangeText={setAmount}
				value={amount}
			/>
			<Input
				hint={t`Optional, as YYYY-MM-DD.`}
				label={t`Due`}
				onChangeText={setDueOn}
				value={dueOn}
			/>
			<Input
				label={t`Notes`}
				multiline
				onChangeText={setNotes}
				value={notes}
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
					{t`Save Loan`}
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
