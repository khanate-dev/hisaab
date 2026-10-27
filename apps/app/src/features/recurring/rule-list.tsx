import { nextDueDate, parseMoney } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatDate, formatMoney } from "@/lib/format";

import { MODE_LABELS } from "./labels";
import { useScheduleText } from "./schedule-text";
import type { RecurringRule } from "./types";

/** The household's Recurring rules: what, how much, how often, and when it's next due. */
export const RuleList = ({
	rules,
	categoryNames,
	baseCurrency,
	today,
	onOpen,
}: {
	rules: readonly RecurringRule[];
	categoryNames: ReadonlyMap<string, string>;
	baseCurrency: string;
	today: string;
	onOpen: (ruleId: string) => void;
}) => {
	const { t, i18n } = useLingui();
	const schedule = useScheduleText();
	if (rules.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Recurring rules yet.`}
			</Text>
		);
	}
	return (
		<View role="list">
			{rules.map((rule) => {
				const name =
					rule.description ??
					categoryNames.get(rule.category_id) ??
					t`Recurring`;
				const how = schedule(rule);
				const mode = i18n._(MODE_LABELS[rule.mode]);
				const amount =
					rule.amount === null
						? t`Varies`
						: formatMoney(parseMoney(rule.amount, baseCurrency));
				const next = nextDueDate(rule, today);
				const nextDate = next === null ? null : formatDate(next);
				const when = nextDate === null ? t`Ended` : t`Next ${nextDate}`;
				return (
					<View
						className="border-b-2 border-border"
						key={rule.id}
						role="listitem"
					>
						<Pressable
							className="min-h-12 gap-0.5 py-2"
							onPress={() => onOpen(rule.id)}
							role="button"
						>
							<Text variant="label">{t`${name} · ${amount}`}</Text>
							<Text variant="muted">{t`${how} · ${mode} · ${when}`}</Text>
						</Pressable>
					</View>
				);
			})}
		</View>
	);
};
