import { isCalendarDate, parseMoney, shiftCalendarDate } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { positiveMoney } from "@/features/entries/draft";
import { useSave } from "@/features/entries/form-checks";
import { formatDate, formatMoney } from "@/lib/format";

import { occurrenceKey } from "./occurrence-key";
import type { Confirmation, Due } from "./types";

type Props = {
	pending: readonly Due[];
	categoryNames: ReadonlyMap<string, string>;
	baseCurrency: string;
	today: string;
	/** Admins and Members confirm, skip and snooze; Viewers only look. */
	canEdit: boolean;
	onConfirm: (confirmations: Confirmation[]) => Promise<void>;
	onSkip: (due: Due) => Promise<void>;
	onSnooze: (due: Due, until: string) => Promise<void>;
};

/** How long a snooze lasts, in days, by the chip that sets it. */
const SNOOZES = [1, 3, 7] as const;

/**
 * Pending Occurrences (spec §4.3): fixed amounts are confirmed together, each picked by default; a variable bill asks
 * for its amount first; any one can be confirmed with changes, skipped or snoozed, for the whole household.
 */
export const PendingList = ({
	pending,
	categoryNames,
	baseCurrency,
	today,
	canEdit,
	onConfirm,
	onSkip,
	onSnooze,
}: Props) => {
	const { t } = useLingui();
	const { busy, error, setError, save } = useSave();
	const fixed = pending.filter((d) => d.rule.amount !== null);
	const [unpicked, setUnpicked] = useState<ReadonlySet<string>>(new Set());
	const picked = fixed.filter((d) => !unpicked.has(occurrenceKey(d)));
	const count = picked.length;
	const name = (due: Due) =>
		due.rule.description ??
		categoryNames.get(due.rule.category_id) ??
		t`Recurring`;

	if (pending.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`Nothing is Pending.`}
			</Text>
		);
	}

	const confirmPicked = () =>
		save(() =>
			onConfirm(
				picked.map((due) => ({
					due,
					amount: due.rule.amount ?? "",
					occurredOn: due.dueOn,
				})),
			),
		);

	return (
		<View className="gap-4">
			{canEdit && fixed.length > 0 && (
				<Button
					disabled={busy || picked.length === 0}
					onPress={() => void confirmPicked()}
				>
					{count === 1 ? t`Confirm 1` : t`Confirm ${count}`}
				</Button>
			)}
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			{pending.map((due) => {
				const key = occurrenceKey(due);
				return (
					<PendingRow
						baseCurrency={baseCurrency}
						canEdit={canEdit}
						due={due}
						key={key}
						name={name(due)}
						onConfirm={(amount, occurredOn) =>
							save(() => onConfirm([{ due, amount, occurredOn }]))
						}
						onPick={(on) =>
							setUnpicked((was) => {
								const next = new Set(was);
								if (on) next.delete(key);
								else next.add(key);
								return next;
							})
						}
						onSkip={() => save(() => onSkip(due))}
						onSnooze={(days) =>
							save(() => onSnooze(due, shiftCalendarDate(today, days)))
						}
						picked={!unpicked.has(key)}
						setError={setError}
						today={today}
					/>
				);
			})}
		</View>
	);
};

const PendingRow = ({
	due,
	name,
	baseCurrency,
	today,
	canEdit,
	picked,
	onPick,
	onConfirm,
	onSkip,
	onSnooze,
	setError,
}: {
	due: Due;
	name: string;
	baseCurrency: string;
	today: string;
	canEdit: boolean;
	picked: boolean;
	onPick: (picked: boolean) => void;
	onConfirm: (amount: string, occurredOn: string) => Promise<void>;
	onSkip: () => Promise<void>;
	onSnooze: (days: number) => Promise<void>;
	setError: (error: string | null) => void;
}) => {
	const { t } = useLingui();
	const variable = due.rule.amount === null;
	const [changing, setChanging] = useState(variable);
	const [snoozing, setSnoozing] = useState(false);
	const [amount, setAmount] = useState(due.rule.amount ?? "");
	const [occurredOn, setOccurredOn] = useState(due.dueOn);
	const dueDate = formatDate(due.dueOn);
	const howMuch = variable
		? t`Amount varies`
		: formatMoney(parseMoney(due.rule.amount ?? "0", baseCurrency));

	const confirm = async () => {
		if (!positiveMoney(amount, baseCurrency))
			return setError(t`Enter an amount more than zero, like 4500.`);
		if (!isCalendarDate(occurredOn.trim()))
			return setError(t`Enter the date as YYYY-MM-DD, like ${today}.`);
		await onConfirm(amount.trim(), occurredOn.trim());
	};

	return (
		<Card>
			<View className="flex-row items-start justify-between gap-3">
				<View
					accessibilityLabel={t`${name}, due ${dueDate}`}
					accessibilityValue={{ text: howMuch }}
					accessible
					className="shrink gap-0.5"
				>
					<Text variant="label">{name}</Text>
					<Text variant="muted">{t`Due ${dueDate} · ${howMuch}`}</Text>
				</View>
				{canEdit && !variable && !changing && (
					<Pressable
						accessibilityLabel={t`Confirm ${name} due ${dueDate} with the others`}
						accessibilityState={{ checked: picked }}
						className={`size-9 items-center justify-center rounded-control border-2 border-border ${picked ? "bg-butter" : "bg-surface"}`}
						onPress={() => onPick(!picked)}
						role="checkbox"
					>
						{picked && <Text variant="label">✓</Text>}
					</Pressable>
				)}
			</View>
			{canEdit && changing && (
				<View className="gap-2">
					<Input
						inputMode="decimal"
						label={t`Amount for ${name} (${baseCurrency})`}
						onChangeText={setAmount}
						value={amount}
					/>
					<Input
						label={t`Date for ${name}`}
						onChangeText={setOccurredOn}
						value={occurredOn}
					/>
					<Button onPress={() => void confirm()}>{t`Confirm ${name}`}</Button>
				</View>
			)}
			{canEdit && (
				<View className="flex-row flex-wrap gap-2">
					{!changing && (
						<Chip
							onPress={() => setChanging(true)}
						>{t`Change and confirm`}</Chip>
					)}
					<Chip
						accessibilityLabel={t`Skip ${name} due ${dueDate}`}
						onPress={() => void onSkip()}
					>
						{t`Skip`}
					</Chip>
					<Chip
						accessibilityLabel={t`Snooze ${name} due ${dueDate}`}
						onPress={() => setSnoozing(!snoozing)}
					>
						{t`Snooze`}
					</Chip>
				</View>
			)}
			{canEdit && snoozing && (
				<View className="flex-row flex-wrap gap-2">
					{SNOOZES.map((days) => (
						<Chip
							key={days}
							onPress={() => void onSnooze(days)}
						>
							{days === 1
								? t`Until tomorrow`
								: days === 7
									? t`For a week`
									: t`For ${days} days`}
						</Chip>
					))}
				</View>
			)}
		</Card>
	);
};
