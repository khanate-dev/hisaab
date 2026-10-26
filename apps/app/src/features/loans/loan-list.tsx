import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import { LOAN_DIRECTION_LABELS } from "./labels";
import type { LoanView } from "./use-loans";

/** The household's Loans, outstanding first: which way, with whom, how much and what's left. */
export const LoanList = ({
	loans,
	onOpen,
}: {
	loans: readonly LoanView[];
	onOpen: (loanId: string) => void;
}) => {
	const { t, i18n } = useLingui();
	if (loans.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Loans yet.`}
			</Text>
		);
	}
	return (
		<View role="list">
			{loans.map((view) => {
				const name = view.contact?.name ?? t`someone`;
				const way = i18n._(LOAN_DIRECTION_LABELS[view.loan.direction]);
				const lent = formatMoney(view.principalAmount);
				const left = formatMoney(view.outstanding);
				return (
					<View
						className="border-b-2 border-border"
						key={view.loan.id}
						role="listitem"
					>
						<Pressable
							className="min-h-12 gap-0.5 py-2"
							onPress={() => onOpen(view.loan.id)}
							role="button"
						>
							<Text variant="label">{t`${way} · ${name}`}</Text>
							<Text variant="muted">
								{view.settled
									? t`${lent}, settled`
									: t`${lent}, ${left} outstanding`}
							</Text>
						</Pressable>
					</View>
				);
			})}
		</View>
	);
};
