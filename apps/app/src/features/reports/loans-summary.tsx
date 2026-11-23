import type { LoanWorth, Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import { useDifference } from "./difference";
import type { Comparison } from "./labels";

type Loan = { id: string; direction: "lent" | "borrowed"; contact_id: string };

/**
 * Loans summary (spec §3.5): what's still owed to the household (Lent) and by it (Borrowed), Loan by Loan, against the
 * previous period's end or the 3-month average. Every figure opens the principals and Repayments behind it.
 */
export const LoansSummaryReport = <L extends Loan>({
	report,
	comparison,
	contactName,
	onDrillDown,
}: {
	report: {
		loans: LoanWorth<L>[];
		lent: Money;
		borrowed: Money;
		previous: { lent: Money; borrowed: Money };
		average: { lent: Money; borrowed: Money };
	};
	comparison: Comparison;
	contactName: (contactId: string) => string;
	/** Opens the Loan Entries: with these Contacts, or every Loan's of a direction. */
	onDrillDown: (contactIds: string[]) => void;
}) => {
	const { t } = useLingui();
	const difference = useDifference();
	const then = comparison === "previous" ? report.previous : report.average;
	const sides = [
		{
			key: "lent" as const,
			label: t`Owed to the household`,
			now: report.lent,
			then: then.lent,
		},
		{
			key: "borrowed" as const,
			label: t`Owed by the household`,
			now: report.borrowed,
			then: then.borrowed,
		},
	];
	if (report.loans.length === 0)
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Loan is outstanding.`}
			</Text>
		);
	return (
		<View className="gap-4">
			{sides.map((side) => {
				const amount = formatMoney(side.now);
				const versus = difference(side.now, side.then);
				const contacts = report.loans
					.filter((l) => l.loan.direction === side.key)
					.map((l) => l.loan.contact_id);
				return (
					<View
						className="gap-1"
						key={side.key}
					>
						<Pressable
							accessibilityHint={t`Shows these Loans' Entries`}
							accessibilityLabel={side.label}
							accessibilityRole="button"
							accessibilityValue={{ text: t`${amount}, ${versus}` }}
							className="flex-row items-center justify-between gap-3"
							disabled={contacts.length === 0}
							onPress={() => onDrillDown(contacts)}
						>
							<Text variant="label">{side.label}</Text>
							<View className="items-end">
								<Text variant="label">{amount}</Text>
								<Text variant="muted">{versus}</Text>
							</View>
						</Pressable>
						<View role="list">
							{report.loans
								.filter((l) => l.loan.direction === side.key)
								.map(({ loan, outstanding }) => {
									const name = contactName(loan.contact_id);
									const owed = formatMoney(outstanding);
									return (
										<Pressable
											accessibilityHint={t`Shows this Loan's Entries`}
											accessibilityLabel={name}
											accessibilityRole="button"
											accessibilityValue={{ text: owed }}
											className="flex-row justify-between border-b-2 border-border py-2 ps-3"
											key={loan.id}
											onPress={() => onDrillDown([loan.contact_id])}
										>
											<Text variant="muted">{name}</Text>
											<Text variant="muted">{owed}</Text>
										</Pressable>
									);
								})}
						</View>
					</View>
				);
			})}
		</View>
	);
};
