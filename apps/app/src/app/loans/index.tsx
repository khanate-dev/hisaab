import { magnitude, parseMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { LOAN_DIRECTION_LABELS } from "@/features/loans/labels";
import { useLoans } from "@/features/loans/use-loans";
import { Screen } from "@/features/shell/screen";
import { formatMoney } from "@/lib/format";
import { useSignedInUserId } from "@/lib/session";

export default function Loans() {
	const { t, i18n } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const loans = useLoans(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;

	return (
		<Screen title={t`Loans`}>
			{canWrite && (
				<Button onPress={() => router.push("/loans/new")}>{t`New Loan`}</Button>
			)}
			{loans !== undefined &&
				(loans.length === 0 ? (
					<Text
						role="status"
						variant="muted"
					>
						{t`No Loans yet.`}
					</Text>
				) : (
					<View role="list">
						{loans.map((view) => {
							const name = view.contact?.name ?? t`someone`;
							const way = i18n._(LOAN_DIRECTION_LABELS[view.direction]);
							const left = formatMoney(view.outstanding);
							const lent = view.principal
								? formatMoney(
										magnitude(parseMoney(view.principal.amount, view.currency)),
									)
								: "";
							return (
								<View
									className="border-b-2 border-border"
									key={view.loan.id}
									role="listitem"
								>
									<Pressable
										className="min-h-12 gap-0.5 py-2"
										onPress={() => router.push(`/loans/${view.loan.id}`)}
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
				))}
		</Screen>
	);
}
