import { budgetMonthOf, shiftBudgetMonth } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Text } from "@/components/ui/text";
import { setBudget, stopBudget } from "@/features/budgets/actions";
import { BudgetMonth } from "@/features/budgets/budget-month";
import { useBudgetMonth } from "@/features/budgets/use-budgets";
import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

export default function Budgets() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const categories = useCategories(household?.id);
	const today = todayIn(entryTimeZone(household));
	const thisMonth = household
		? budgetMonthOf(today, household.budget_month_start_day)
		: undefined;
	// Months away from this one, so the tab follows today across a month boundary; back to this one in another
	// household.
	const [moved, setMoved] = useState({ householdId: household?.id, offset: 0 });
	const offset = moved.householdId === household?.id ? moved.offset : 0;
	const move = (by: number) =>
		setMoved({ householdId: household?.id, offset: offset + by });
	const month =
		thisMonth === undefined ? undefined : shiftBudgetMonth(thisMonth, offset);
	const view = useBudgetMonth(household, month, today);

	if (household && !household.base_currency) {
		return (
			<Screen title={t`Budgets`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`Budgets are in the household's Base currency, which its first Wallet sets.`}
				</Text>
			</Screen>
		);
	}

	return (
		<Screen title={t`Budgets`}>
			{household && view && categories && (
				<BudgetMonth
					canEdit={canWrite}
					categories={categories}
					onNext={() => move(1)}
					onPrevious={() => move(-1)}
					onSet={({ categoryId, amount, scope }) =>
						setBudget(
							{ householdId: household.id, categoryId, month: view.month },
							amount,
							scope,
						)
					}
					onStop={(categoryId) =>
						stopBudget({
							householdId: household.id,
							categoryId,
							month: view.month,
						})
					}
					view={view}
				/>
			)}
		</Screen>
	);
}
