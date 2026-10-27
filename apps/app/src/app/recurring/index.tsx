import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { RuleList } from "@/features/recurring/rule-list";
import { useRecurringRules } from "@/features/recurring/use-recurring";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

export default function RecurringRules() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const rules = useRecurringRules(household?.id);
	const categories = useCategories(household?.id);
	const names = useMemo(
		() => new Map((categories ?? []).map((c) => [c.id, c.name])),
		[categories],
	);

	return (
		<Screen title={t`Recurring rules`}>
			<Button
				onPress={() => router.push("/pending")}
				variant="secondary"
			>
				{t`Pending`}
			</Button>
			{canWrite && (
				<Button onPress={() => router.push("/recurring/new")}>
					{t`New Recurring rule`}
				</Button>
			)}
			{household?.base_currency && rules !== undefined && (
				<RuleList
					baseCurrency={household.base_currency}
					categoryNames={names}
					onOpen={(id) => router.push(`/recurring/${id}`)}
					rules={rules}
					today={todayIn(entryTimeZone(household))}
				/>
			)}
		</Screen>
	);
}
