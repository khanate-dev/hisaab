import {
	categoryTree,
	descriptionSuggestions,
	FLOW_KINDS,
	type FlowKind,
	isCalendarDate,
	isDecimalAmount,
	isNegative,
	isTimeOfDay,
	isZero,
	magnitude,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import type { Category } from "@/features/categories/types";
import { todayIn } from "@/lib/dates";

import { entryKindLabel } from "./labels";
import type { Entry, EntryDraft, WalletChoice } from "./types";

const DEFAULT_KIND: FlowKind = "expense";

type Props = {
	/** The Entry being edited; absent when recording one. Its kind is fixed. */
	entry?: Entry;
	/** Where a new Entry starts, say what quick-add had when Items opened the full form. */
	initial?: Partial<EntryDraft>;
	/** The household's Wallets, archived ones included: active ones are offered. */
	wallets: readonly WalletChoice[];
	categories: readonly Category[];
	/** Past Entries, for description suggestions. */
	history: readonly Entry[];
	/**
	 * Entries are recorded in the household's Base currency only until Base amounts land (#45, ADR-0005); null
	 * before the household has one.
	 */
	baseCurrency: string | null;
	/** The household's timezone; the date starts as today in it. */
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	submitLabel: string;
	onSubmit: (draft: EntryDraft, currency: string) => Promise<void>;
};

const orNull = (text: string) => (text.trim() === "" ? null : text.trim());

/**
 * Record or edit an Expense or Income: how much, from or into which Wallet, its Category, a description (with
 * suggestions from past Entries), the date in the household's timezone, an optional time, and notes (spec §3.3).
 */
export const EntryForm = ({
	entry,
	initial = {},
	wallets,
	categories,
	history,
	baseCurrency,
	timeZone,
	today = todayIn(timeZone),
	submitLabel,
	onSubmit,
}: Props) => {
	const { t, i18n } = useLingui();
	const walletOf = (id: string | undefined) => wallets.find((w) => w.id === id);
	const recordable = (w: WalletChoice) =>
		w.archived_at === null &&
		(baseCurrency === null || w.currency === baseCurrency);
	const active = wallets.filter(recordable);
	const linked = walletOf(initial.walletId);
	// An Entry keeps its own Wallet even after it's archived; a new one only starts in a Wallet it can go into.
	const startWallet =
		walletOf(entry?.wallet_id) ??
		(linked && recordable(linked) ? linked : active[0]);

	const [kind, setKind] = useState<FlowKind>(
		entry?.kind === "income" || entry?.kind === "expense"
			? entry.kind
			: (initial.kind ?? DEFAULT_KIND),
	);
	const [amount, setAmount] = useState(
		entry && startWallet
			? magnitude(parseMoney(entry.amount, startWallet.currency)).toString()
			: (initial.amount ?? ""),
	);
	const [walletId, setWalletId] = useState(startWallet?.id ?? "");
	const [categoryId, setCategoryId] = useState(
		entry?.category_id ?? initial.categoryId ?? "",
	);
	const [description, setDescription] = useState(
		entry?.description ?? initial.description ?? "",
	);
	const [picked, setPicked] = useState(
		entry !== undefined || initial.description != null,
	);
	const [occurredOn, setOccurredOn] = useState(
		entry?.occurred_on ?? initial.occurredOn ?? today,
	);
	const [occurredTime, setOccurredTime] = useState(entry?.occurred_time ?? "");
	const [notes, setNotes] = useState(entry?.notes ?? "");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const walletChoices = [
		...active,
		...(startWallet && !recordable(startWallet) ? [startWallet] : []),
	];
	const otherCurrencies = wallets.some(
		(w) => w.archived_at === null && !recordable(w),
	);
	const categoryChoices = categoryTree(categories, kind).flatMap(
		({ category, subcategories }) => {
			const parentName = category.name;
			return [
				{ value: category.id, label: parentName },
				...subcategories.map(({ id, name }) => ({
					value: id,
					label: t`${parentName} › ${name}`,
				})),
			];
		},
	);
	// An Entry keeps showing its Category even after that Category is archived.
	const current = categories.find((c) => c.id === entry?.category_id);
	if (
		current &&
		current.kind === kind &&
		!categoryChoices.some((c) => c.value === current.id)
	)
		categoryChoices.unshift({ value: current.id, label: current.name });

	const suggestions = picked
		? []
		: descriptionSuggestions(history, description, kind, 4);

	const chooseKind = (next: FlowKind) => {
		setKind(next);
		setCategoryId("");
	};

	const applySuggestion = (past: Entry) => {
		setDescription(past.description ?? "");
		setPicked(true);
		const category = categories.find((c) => c.id === past.category_id);
		if (category && category.archived_at === null) setCategoryId(category.id);
		const wallet = walletOf(past.wallet_id);
		if (wallet && recordable(wallet)) {
			setWalletId(wallet.id);
			setAmount(magnitude(parseMoney(past.amount, wallet.currency)).toString());
		}
	};

	const submit = async () => {
		const wallet = walletOf(walletId);
		const typed = amount.trim();
		if (!isDecimalAmount(typed))
			return setError(t`Enter an amount like 1500 or 1500.50.`);
		if (!wallet) return setError(t`Pick a Wallet.`);
		const money = parseMoney(typed, wallet.currency);
		if (isNegative(money) || isZero(money))
			return setError(t`The amount is more than zero.`);
		if (!categoryChoices.some((c) => c.value === categoryId))
			return setError(t`Pick a Category.`);
		if (!isCalendarDate(occurredOn.trim()))
			return setError(t`Enter the date as YYYY-MM-DD, like ${today}.`);
		const time = orNull(occurredTime);
		if (time !== null && !isTimeOfDay(time))
			return setError(
				t`Enter the time as HH:MM, like 18:30, or leave it empty.`,
			);
		if (description.trim().length > 200)
			return setError(t`Keep the description to 200 characters or fewer.`);
		if (notes.trim().length > 1000)
			return setError(t`Keep the notes to 1000 characters or fewer.`);
		setError(null);
		setBusy(true);
		try {
			await onSubmit(
				{
					kind,
					amount: typed,
					walletId: wallet.id,
					categoryId,
					occurredOn: occurredOn.trim(),
					occurredTime: time,
					description: orNull(description),
					notes: orNull(notes),
				},
				wallet.currency,
			);
		} catch {
			// A local write that fails is a bug, not something to explain; the message is the driver's, never copy.
			setError(t`That didn't save. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	const currency = walletOf(walletId)?.currency;

	return (
		<View className="gap-4">
			{entry === undefined ? (
				<RadioGroup
					label={t`Kind`}
					onValueChange={chooseKind}
					options={FLOW_KINDS.map((value) => ({
						value,
						label: i18n._(entryKindLabel(value)),
					}))}
					value={kind}
				/>
			) : (
				<Text variant="label">{i18n._(entryKindLabel(kind))}</Text>
			)}
			<Input
				inputMode="decimal"
				label={currency ? t`Amount (${currency})` : t`Amount`}
				onChangeText={setAmount}
				value={amount}
			/>
			<View className="gap-2">
				<Text variant="label">{kind === "expense" ? t`From` : t`Into`}</Text>
				<RadioGroup
					label={kind === "expense" ? t`From Wallet` : t`Into Wallet`}
					onValueChange={setWalletId}
					options={walletChoices.map((w) => ({ value: w.id, label: w.name }))}
					value={walletId}
				/>
				{otherCurrencies && (
					<Text variant="muted">
						{t`Wallets in other currencies take Entries once exchange rates arrive.`}
					</Text>
				)}
			</View>
			<View className="gap-2">
				<Text variant="label">{t`Category`}</Text>
				<RadioGroup
					label={t`Category`}
					onValueChange={setCategoryId}
					options={categoryChoices}
					value={categoryId}
				/>
			</View>
			<View className="gap-2">
				<Input
					label={t`Description`}
					onChangeText={(text) => {
						setDescription(text);
						setPicked(false);
					}}
					value={description}
				/>
				{suggestions.length > 0 && (
					<View
						accessibilityLabel={t`Earlier Entries like this`}
						className="flex-row flex-wrap gap-2"
					>
						{suggestions.map((past) => (
							<Button
								accessibilityHint={t`Fills in its Category, Wallet and amount`}
								key={past.id}
								onPress={() => applySuggestion(past)}
								variant="secondary"
							>
								{past.description ?? ""}
							</Button>
						))}
					</View>
				)}
			</View>
			<Input
				hint={t`In the household's timezone, ${timeZone}.`}
				label={t`Date`}
				onChangeText={setOccurredOn}
				value={occurredOn}
			/>
			<Input
				hint={t`Optional, as HH:MM.`}
				label={t`Time`}
				onChangeText={setOccurredTime}
				value={occurredTime}
			/>
			<Input
				label={t`Notes`}
				multiline
				onChangeText={setNotes}
				value={notes}
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
