import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import { Button } from "@/components/ui/button";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { LoanList } from "@/features/loans/loan-list";
import { useLoans } from "@/features/loans/use-loans";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function Loans() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const loans = useLoans(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;

	return (
		<Screen title={t`Loans`}>
			{canWrite && (
				<Button onPress={() => router.push("/loans/new")}>{t`New Loan`}</Button>
			)}
			{loans !== undefined && (
				<LoanList
					loans={loans}
					onOpen={(id) => router.push(`/loans/${id}`)}
				/>
			)}
		</Screen>
	);
}
