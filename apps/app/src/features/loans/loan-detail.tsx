import { magnitude, parseMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Confirm } from "@/components/ui/confirm";
import { Text } from "@/components/ui/text";
import type { WalletChoice } from "@/features/entries/types";
import { formatDate, formatMoney } from "@/lib/format";

import { LoanEditForm } from "./loan-edit-form";
import { RepaymentForm } from "./repayment-form";
import type { LoanView } from "./use-loans";

type Props = {
	view: LoanView;
	wallets: readonly WalletChoice[];
	/** Admins and Members record Repayments, edit, write off and delete; Viewers only look. */
	canEdit: boolean;
	today: string;
	onRepay: (repayment: {
		walletId: string;
		amount: string;
		occurredOn: string;
	}) => Promise<void>;
	onEdit: (changes: {
		amount: string;
		dueOn: string | null;
		notes: string | null;
	}) => Promise<void>;
	onDeleteRepayment: (entryId: string) => Promise<void>;
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
	onEdit,
	onDeleteRepayment,
	onWriteOff,
	onDelete,
}: Props) => {
	const { t } = useLingui();
	const {
		loan,
		contact,
		repayments,
		currency,
		outstanding,
		settled,
		principalAmount,
	} = view;
	const [repaying, setRepaying] = useState(false);
	const [editing, setEditing] = useState(false);
	const lent = loan.direction === "lent";
	const name = contact?.name ?? t`someone`;
	const howMuch = formatMoney(principalAmount);
	const left = formatMoney(outstanding);
	const writtenOff = loan.written_off_at !== null;
	const standing = !settled ? left : writtenOff ? t`Written off` : t`Settled`;
	const due = loan.due_on === null ? null : formatDate(loan.due_on);

	return (
		<View className="gap-4">
			<Card>
				<Text variant="muted">
					{lent
						? t`Lent ${howMuch} to ${name}`
						: t`Borrowed ${howMuch} from ${name}`}
				</Text>
				<View
					accessibilityLabel={t`Outstanding`}
					accessibilityValue={{ text: standing }}
					accessible
					className="gap-0.5"
				>
					<Text variant="muted">{t`Outstanding`}</Text>
					<Text variant="figure">{standing}</Text>
				</View>
				{due !== null && <Text variant="muted">{t`Due ${due}`}</Text>}
				{loan.notes !== null && <Text variant="muted">{loan.notes}</Text>}
			</Card>

			{canEdit && !repaying && !editing && (
				<View className="flex-row flex-wrap gap-3">
					{!settled && (
						<Button
							onPress={() => setRepaying(true)}
						>{t`Record Repayment`}</Button>
					)}
					<Button
						onPress={() => setEditing(true)}
						variant="secondary"
					>
						{t`Edit Loan`}
					</Button>
					{writtenOff ? (
						<Button
							onPress={() => void onWriteOff(false)}
							variant="secondary"
						>
							{t`Undo write-off`}
						</Button>
					) : (
						!settled && (
							<Confirm
								action={t`Write off`}
								description={t`The Loan is settled without it. Its Repayments stay, and you can undo this.`}
								onConfirm={() => void onWriteOff(true)}
								title={t`Write off ${left}?`}
								trigger={t`Write off`}
							/>
						)
					)}
					<Confirm
						action={t`Delete Loan`}
						description={t`Its principal and Repayments go with it, and their Wallets' Balances change back.`}
						onConfirm={() => void onDelete()}
						title={t`Delete this Loan?`}
						trigger={t`Delete Loan`}
					/>
				</View>
			)}

			{repaying && (
				<RepaymentForm
					lent={lent}
					onCancel={() => setRepaying(false)}
					onSubmit={async (repayment) => {
						await onRepay(repayment);
						setRepaying(false);
					}}
					outstanding={outstanding}
					today={today}
					wallets={wallets}
				/>
			)}
			{editing && (
				<LoanEditForm
					onCancel={() => setEditing(false)}
					onSubmit={async (changes) => {
						await onEdit(changes);
						setEditing(false);
					}}
					view={view}
				/>
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
								className="min-h-12 flex-row items-center justify-between gap-3 border-b-2 border-border py-2"
								key={repayment.id}
								role="listitem"
							>
								<View
									accessibilityLabel={t`${paid} on ${day}`}
									accessible
									className="shrink grow flex-row justify-between gap-3"
								>
									<Text variant="label">{day}</Text>
									<Text variant="label">{paid}</Text>
								</View>
								{canEdit && (
									<Chip
										accessibilityLabel={t`Delete the ${paid} Repayment`}
										onPress={() => void onDeleteRepayment(repayment.id)}
									>
										{t`Delete`}
									</Chip>
								)}
							</View>
						);
					})}
				</View>
			)}
		</View>
	);
};
