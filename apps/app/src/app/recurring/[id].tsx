import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";

import { Confirm } from "@/components/ui/confirm";
import { Text } from "@/components/ui/text";
import { useEntryData } from "@/features/entries/use-entry-data";
import { deleteRule, updateRule } from "@/features/recurring/actions";
import { RuleForm } from "@/features/recurring/rule-form";
import { useRecurringRules } from "@/features/recurring/use-recurring";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";

export default function RecurringRuleScreen() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const data = useEntryData();
	const rules = useRecurringRules(data?.household.id);
	const rule = rules?.find((r) => r.id === id);

	if (!data || rules === undefined) return null;
	const { household, wallets, categories, canWrite, userId } = data;
	const today = todayIn(entryTimeZone(household));
	if (!rule || !household.base_currency) {
		return (
			<Screen title={t`Recurring rule`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`This Recurring rule isn't here. It may have been deleted, or not synced yet.`}
				</Text>
			</Screen>
		);
	}

	return (
		<Screen title={t`Recurring rule`}>
			{canWrite ? (
				<>
					<Text variant="muted">
						{t`Changes reach what's still to come or Pending; Entries already recorded stay as they are.`}
					</Text>
					<RuleForm
						baseCurrency={household.base_currency}
						categories={categories}
						onSubmit={async (draft) => {
							await updateRule(rule, userId, draft, today);
							leaveTo("/recurring");
						}}
						rule={rule}
						submitLabel={t`Save changes`}
						today={today}
						wallets={wallets}
					/>
					<Confirm
						action={t`Delete rule`}
						description={t`Nothing more becomes due from it. The Entries it already made stay.`}
						onConfirm={() =>
							void deleteRule(rule.id).then(() => leaveTo("/recurring"))
						}
						title={t`Delete this Recurring rule?`}
						trigger={t`Delete rule`}
					/>
				</>
			) : (
				<Text variant="muted">{t`Only Admins and Members change Recurring rules.`}</Text>
			)}
		</Screen>
	);
}
