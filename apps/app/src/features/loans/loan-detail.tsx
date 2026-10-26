import {
	isDecimalAmount,
	isNegative,
	isZero,
	magnitude,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { recordableWallets } from "@/features/entries/draft";
import { useCommonChecks, useSave } from "@/features/entries/form-checks";
import type { WalletChoice } from "@/features/entries/types";
import { formatDate, formatMoney } from "@/lib/format";

import type { LoanView } from "./use-loans";

type Props = {
	view: LoanView;
	wallets: readonly WalletChoice[];
	/** Admins and Members record Repayments, write off and delete; Viewers only look. */
	canEdit: boolean;
	today: string;
	onRepay: (repayment: {
		walletId: string;
		amount: string;
		occurredOn: string;
	}) => Promise<void>;
	onWriteOff: (writtenOff: boolean) => Promise<void>;
	onDelete: () => Promise<void>;
};

/** A Loan: who, which way, how much is still outstanding, and its Repayments (spec §3.2). */
export const LoanDetail = ({
	view,
	wallets,
	canEdit,
	today,
	onRepay,
	onWriteOff,
	onDelete,
}: Props) => {
	const { t } = useLingui();
	const checks = useCommonChecks();
	const { busy, error, setError, save } = useSave();
	const {
		loan,
		direction,
		contact,
		principal,
		repayments,
		currency,
		outstanding,
		settled,
	} = view;
	// Repayments go to or from any Wallet in the Loan's currency.
	const repayable = recordableWallets(wallets, currency);
	const [repaying, setRepaying] = useState(false);
	const [walletId, setWalletId] = useState(repayable[0]?.id ?? "");
	const [amount, setAmount] = useState("");
	const [occurredOn, setOccurredOn] = useState(today);

	const name = contact?.name ?? t`someone`;
	const lent = principal
		? formatMoney(magnitude(parseMoney(principal.amount, currency)))
		: "";
	const left = formatMoney(outstanding);
	const writtenOff = loan.written_off_at !== null;
	const due = loan.due_on === null ? null : formatDate(loan.due_on);

	const repay = async () => {
		const typed = amount.trim();
		const money = isDecimalAmount(typed) ? parseMoney(typed, currency) : null;
		if (!money || isNegative(money) || isZero(money))
			return setError(t`Enter an amount more than zero, like 500.`);
		if (!repayable.some((w) => w.id === walletId))
			return setError(t`Pick a Wallet.`);
		const problem = checks({ occurredOn, description: "", notes: "", today });
		if (problem) return setError(problem);
		await save(async () => {
			await onRepay({ walletId, amount: typed, occurredOn: occurredOn.trim() });
			setAmount("");
			setRepaying(false);
		});
	};

	return (
		<View className="gap-4">
			<Card>
				<Text variant="muted">
					{direction === "lent"
						? t`Lent ${lent} to ${name}`
						: t`Borrowed ${lent} from ${name}`}
				</Text>
				<View
					accessibilityLabel={t`Outstanding`}
					accessibilityValue={{
						text: settled ? (writtenOff ? t`Written off` : t`Settled`) : left,
					}}
					accessible
					className="gap-0.5"
				>
					<Text variant="muted">{t`Outstanding`}</Text>
					<Text variant="figure">
						{settled ? (writtenOff ? t`Written off` : t`Settled`) : left}
					</Text>
				</View>
				{due !== null && <Text variant="muted">{t`Due ${due}`}</Text>}
			</Card>

			{canEdit && (
				<View className="flex-row flex-wrap gap-3">
					{!settled && !repaying && (
						<Button
							onPress={() => setRepaying(true)}
						>{t`Record Repayment`}</Button>
					)}
					{writtenOff ? (
						<Button
							onPress={() => void onWriteOff(false)}
							variant="secondary"
						>
							{t`Undo write-off`}
						</Button>
					) : (
						!settled && (
							<Dialog>
								<DialogTrigger asChild>
									<Button variant="secondary">{t`Write off`}</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogTitle>{t`Write off ${left}?`}</DialogTitle>
									<DialogDescription>
										{t`The Loan is settled without it. Its Repayments stay, and you can undo this.`}
									</DialogDescription>
									<DialogFooter>
										<DialogClose asChild>
											<Button variant="secondary">{t`Cancel`}</Button>
										</DialogClose>
										<DialogClose asChild>
											<Button
												onPress={() => void onWriteOff(true)}
											>{t`Write off`}</Button>
										</DialogClose>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						)
					)}
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="secondary">{t`Delete Loan`}</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogTitle>{t`Delete this Loan?`}</DialogTitle>
							<DialogDescription>
								{t`Its principal and Repayments go with it, and their Wallets' Balances change back.`}
							</DialogDescription>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="secondary">{t`Cancel`}</Button>
								</DialogClose>
								<DialogClose asChild>
									<Button
										onPress={() => void onDelete()}
									>{t`Delete Loan`}</Button>
								</DialogClose>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</View>
			)}

			{repaying && (
				<View className="gap-3 rounded-control border-2 border-border p-3">
					<RadioGroup
						label={direction === "lent" ? t`Into Wallet` : t`From Wallet`}
						onValueChange={setWalletId}
						options={repayable.map((w) => ({ value: w.id, label: w.name }))}
						value={walletId}
					/>
					<Input
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
							onPress={() => void repay()}
						>
							{t`Save Repayment`}
						</Button>
						<Button
							onPress={() => setRepaying(false)}
							variant="secondary"
						>
							{t`Cancel`}
						</Button>
					</View>
				</View>
			)}

			<Text variant="title">{t`Repayments`}</Text>
			{repayments.length === 0 ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`No Repayments yet.`}
				</Text>
			) : (
				<View role="list">
					{repayments.map((repayment) => {
						const day = formatDate(repayment.occurred_on);
						const paid = formatMoney(
							magnitude(parseMoney(repayment.amount, currency)),
						);
						return (
							<View
								accessibilityLabel={t`${paid} on ${day}`}
								accessible
								className="flex-row justify-between border-b-2 border-border py-2"
								key={repayment.id}
								role="listitem"
							>
								<Text variant="label">{day}</Text>
								<Text variant="label">{paid}</Text>
							</View>
						);
					})}
				</View>
			)}
		</View>
	);
};
