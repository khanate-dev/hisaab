import {
	CATEGORY_KINDS,
	RECURRING_FREQUENCIES,
	RECURRING_MODES,
	type RecurringFrequency,
	type RecurringMode,
} from "@hisaab/client-schema";
import { categoryTree, isCalendarDate } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import type { Category } from "@/features/categories/types";
import { positiveMoney, recordableWallets } from "@/features/entries/draft";
import { useSave } from "@/features/entries/form-checks";
import { entryKindLabel } from "@/features/entries/labels";
import type { WalletChoice } from "@/features/entries/types";

import { FREQUENCY_LABELS, MODE_LABELS } from "./labels";
import {
	AUTO,
	CONFIRM,
	MONTHLY,
	type RecurringRule,
	type RuleDraft,
} from "./types";

type Props = {
	categories: readonly Category[];
	wallets: readonly WalletChoice[];
	baseCurrency: string;
	today: string;
	/** The rule being edited; absent when making one. */
	rule?: RecurringRule;
	submitLabel: string;
	onSubmit: (draft: RuleDraft) => Promise<void>;
};

const whole = (text: string) =>
	/^\d+$/.test(text.trim()) ? Number(text.trim()) : null;

/**
 * Make or edit a Recurring rule (spec §3.3): a template Expense or Income, a schedule (monthly on day N, every N
 * months, weekly, every N weeks, yearly) with an optional end, and whether each Occurrence waits for a confirm (the
 * default) or is recorded on its due date.
 */
export const RuleForm = ({
	categories,
	wallets,
	baseCurrency,
	today,
	rule,
	submitLabel,
	onSubmit,
}: Props) => {
	const { t, i18n } = useLingui();
	const { busy, error, setError, save } = useSave();
	const usable = recordableWallets(wallets, baseCurrency);
	const [kind, setKind] = useState<RecurringRule["kind"]>(
		rule?.kind ?? CATEGORY_KINDS[0],
	);
	const choices = categoryTree(categories, kind).flatMap(
		({ category, subcategories }) => [
			{ value: category.id, label: category.name },
			...subcategories.map(({ id, name }) => {
				const parent = category.name;
				return { value: id, label: t`${parent}: ${name}` };
			}),
		],
	);
	const [walletId, setWalletId] = useState(
		rule?.wallet_id ?? usable[0]?.id ?? "",
	);
	const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
	const [amount, setAmount] = useState(rule?.amount ?? "");
	const [description, setDescription] = useState(rule?.description ?? "");
	const [frequency, setFrequency] = useState<RecurringFrequency>(
		rule?.frequency ?? MONTHLY,
	);
	const [interval, setInterval] = useState(String(rule?.interval ?? 1));
	const [dayOfMonth, setDayOfMonth] = useState(
		String(rule?.day_of_month ?? Number(today.slice(8))),
	);
	const [startsOn, setStartsOn] = useState(rule?.starts_on ?? today);
	const [endsOn, setEndsOn] = useState(rule?.ends_on ?? "");
	const [mode, setMode] = useState<RecurringMode>(rule?.mode ?? CONFIRM);
	const category = choices.some((c) => c.value === categoryId)
		? categoryId
		: (choices[0]?.value ?? "");

	const submit = async () => {
		const typed = amount.trim();
		if (typed !== "" && !positiveMoney(typed, baseCurrency))
			return setError(
				t`Enter an amount more than zero, like 5000, or leave it empty.`,
			);
		if (typed === "" && mode === AUTO)
			return setError(
				t`Auto-record needs an amount; leave it to Confirm for a bill that varies.`,
			);
		if (!usable.some((w) => w.id === walletId))
			return setError(t`Pick a Wallet.`);
		if (!category) return setError(t`Pick a Category.`);
		const every = whole(interval);
		if (every === null || every < 1 || every > 24)
			return setError(t`Repeat every 1 to 24.`);
		const day = whole(dayOfMonth);
		if (frequency === MONTHLY && (day === null || day < 1 || day > 31))
			return setError(t`Pick a day of the month from 1 to 31.`);
		if (!isCalendarDate(startsOn.trim()))
			return setError(t`Enter the start as YYYY-MM-DD, like ${today}.`);
		const end = endsOn.trim();
		if (end !== "" && (!isCalendarDate(end) || end < startsOn.trim()))
			return setError(
				t`Enter an end on or after the start, or leave it empty.`,
			);
		if (description.trim().length > 200)
			return setError(t`Keep the description to 200 characters or fewer.`);
		await save(() =>
			onSubmit({
				mode,
				kind,
				walletId,
				categoryId: category,
				amount: typed === "" ? null : typed,
				description: description.trim() === "" ? null : description.trim(),
				frequency,
				interval: every,
				dayOfMonth: frequency === MONTHLY ? day : null,
				startsOn: startsOn.trim(),
				endsOn: end === "" ? null : end,
			}),
		);
	};

	return (
		<View className="gap-4">
			{!rule && (
				<RadioGroup
					label={t`Kind`}
					onValueChange={setKind}
					options={CATEGORY_KINDS.map((k) => ({
						value: k,
						label: i18n._(entryKindLabel(k)),
					}))}
					value={kind}
				/>
			)}
			<Input
				hint={t`Leave it empty for a bill that varies: it's asked for when you confirm.`}
				inputMode="decimal"
				label={t`Amount (${baseCurrency})`}
				onChangeText={setAmount}
				value={amount}
			/>
			<RadioGroup
				label={t`Wallet`}
				onValueChange={setWalletId}
				options={usable.map((w) => ({ value: w.id, label: w.name }))}
				value={walletId}
			/>
			<RadioGroup
				label={t`Category`}
				onValueChange={setCategoryId}
				options={choices}
				value={category}
			/>
			<Input
				label={t`Description`}
				onChangeText={setDescription}
				value={description}
			/>
			<RadioGroup
				label={t`Repeats`}
				onValueChange={setFrequency}
				options={RECURRING_FREQUENCIES.map((f) => ({
					value: f,
					label: i18n._(FREQUENCY_LABELS[f]),
				}))}
				value={frequency}
			/>
			<Input
				hint={t`1 for every one; 2 for every other one.`}
				inputMode="numeric"
				label={t`Every`}
				onChangeText={setInterval}
				value={interval}
			/>
			{frequency === MONTHLY && (
				<Input
					hint={t`A shorter month has it on its last day.`}
					inputMode="numeric"
					label={t`Day of the month`}
					onChangeText={setDayOfMonth}
					value={dayOfMonth}
				/>
			)}
			<Input
				label={t`Starts`}
				onChangeText={setStartsOn}
				value={startsOn}
			/>
			<Input
				hint={t`Optional.`}
				label={t`Ends`}
				onChangeText={setEndsOn}
				value={endsOn}
			/>
			<RadioGroup
				label={t`When it's due`}
				onValueChange={setMode}
				options={RECURRING_MODES.map((m) => ({
					value: m,
					label: i18n._(MODE_LABELS[m]),
				}))}
				value={mode}
			/>
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			<Button
				disabled={busy}
				onPress={() => void submit()}
			>
				{submitLabel}
			</Button>
		</View>
	);
};
