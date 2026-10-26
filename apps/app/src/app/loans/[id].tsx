import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/text";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import {
	deleteLoan,
	deleteRepayment,
	recordRepayment,
	setWrittenOff,
	updateLoan,
} from "@/features/loans/actions";
import { LoanDetail } from "@/features/loans/loan-detail";
import { useLoans } from "@/features/loans/use-loans";
import { Screen } from "@/features/shell/screen";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function LoanScreen() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const loans = useLoans(household?.id);
	const wallets = useWalletRows(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const view = loans?.find((l) => l.loan.id === id);

	if (!household || loans === undefined || !wallets) return null;
	if (!view) {
		return (
			<Screen title={t`Loan`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`This Loan isn't here. It may have been deleted, or not synced yet.`}
				</Text>
			</Screen>
		);
	}

	return (
		<Screen title={view.contact?.name ?? t`Loan`}>
			<LoanDetail
				canEdit={canWrite}
				onDelete={async () => {
					await deleteLoan(view.loan.id);
					leaveTo("/loans");
				}}
				onDeleteRepayment={deleteRepayment}
				onEdit={(changes) =>
					updateLoan(view.loan, view.principal.id, changes, view.currency)
				}
				onRepay={(repayment) =>
					recordRepayment(
						household.id,
						userId,
						view.loan,
						repayment,
						view.currency,
					)
				}
				onWriteOff={(writtenOff) => setWrittenOff(view.loan.id, writtenOff)}
				today={todayIn(entryTimeZone(household))}
				view={view}
				wallets={wallets}
			/>
		</Screen>
	);
}
