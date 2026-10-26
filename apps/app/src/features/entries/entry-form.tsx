import {
	categoryTree,
	descriptionSuggestions,
	FLOW_KINDS,
	type FlowKind,
	isDecimalAmount,
	isNegative,
	isTimeOfDay,
	isZero,
	magnitude,
	withRest,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Pencil } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import type { Category } from "@/features/categories/types";
import { todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { newId } from "@/lib/ids";

import {
	orNull,
	recordableWallets,
	repeatEntry,
	startingWallet,
} from "./draft";
import { useCommonChecks, useSave } from "./form-checks";
import { entryKindLabel, useItemNames } from "./labels";
import { ItemsSection } from "./items-section";
import type {
	Entry,
	EntryDraft,
	EntryItem,
	ItemDraft,
	WalletChoice,
} from "./types";

const DEFAULT_KIND: FlowKind = "expense";

type Props = {
	/** The Entry being edited; absent when recording one. Its kind is fixed. */
	entry?: Entry;
	/** Where a new Entry starts, say what quick-add had when Items opened the full form. */
	initial?: Partial<EntryDraft>;
	/** The edited Expense's Items, if it has any. */
	items?: readonly EntryItem[];
	/** Open straight onto adding the Expense's Items (quick-add's Items chip). */
	itemize?: boolean;
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
	/** The Member's default Wallet in the household: where a new one starts, when it can. */
	defaultWalletId?: string | null;
	/** The household's timezone; the date starts as today in it. */
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	submitLabel: string;
	onSubmit: (draft: EntryDraft, currency: string) => Promise<void>;
};

/**
 * Record or edit an Expense or Income: how much, from or into which Wallet, its Category, a description (with
 * suggestions from past Entries), the date in the household's timezone, an optional time, and notes (spec §3.3).
 */
export const EntryForm = ({
	entry,
	initial = {},
	items: savedItems = [],
	itemize: startItemizing = false,
	wallets,
	categories,
	history,
	baseCurrency,
	defaultWalletId,
	timeZone,
	today = todayIn(timeZone),
	submitLabel,
	onSubmit,
}: Props) => {
	const { t, i18n } = useLingui();
	const walletOf = (id: string | undefined) => wallets.find((w) => w.id === id);
	const active = recordableWallets(wallets, baseCurrency);
	const recordable = (w: WalletChoice) => active.includes(w);
	const linked = walletOf(initial.walletId);
	// An Entry keeps its own Wallet even after it's archived; a new one only starts in a Wallet it can go into.
	const startWallet =
		walletOf(entry?.wallet_id) ??
		(linked && recordable(linked)
			? linked
			: startingWallet(active, defaultWalletId));

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
	// The saved Rest isn't one of the Items added: it's recomputed from them, keeping its id.
	const savedRest = savedItems.find((item) => item.rest);
	const [items, setItems] = useState<ItemDraft[]>(() =>
		savedItems
			.filter((item) => !item.rest)
			.toSorted((a, b) => a.position - b.position)
			.map((item) => ({
				id: item.id,
				description: item.description,
				amount: item.amount,
				quantity: item.quantity,
				categoryId: item.category_id,
				rest: false,
			})),
	);
	const [changingTotal, setChangingTotal] = useState(false);
	const names = useItemNames();
	const checks = useCommonChecks();
	const { busy, error, setError, save } = useSave();

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
		const filled = repeatEntry(past, categories, wallets, baseCurrency);
		setDescription(filled.description ?? "");
		setPicked(true);
		setAmount(filled.amount);
		setCategoryId(filled.categoryId);
		if (filled.walletId) setWalletId(filled.walletId);
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
		const problem = checks({ occurredOn, description, notes, today });
		if (problem) return setError(problem);
		const time = orNull(occurredTime);
		if (time !== null && !isTimeOfDay(time))
			return setError(
				t`Enter the time as HH:MM, like 18:30, or leave it empty.`,
			);
		// Once an Expense has Items its total is their sum: the Rest becomes "Other <category>" (spec §4.3).
		const itemized =
			kind === "expense"
				? withRest(
						money,
						items.map((item) => ({
							...item,
							amount: parseMoney(item.amount, wallet.currency),
						})),
						(rest) => ({
							id: savedRest?.id ?? newId(),
							description: names.rest(chosenCategory?.name),
							amount: rest,
							quantity: null,
							categoryId,
							rest: true,
						}),
					)
				: { total: money, items: [] };
		await save(() =>
			onSubmit(
				{
					kind,
					amount: itemized.total.toString(),
					walletId: wallet.id,
					categoryId,
					occurredOn: occurredOn.trim(),
					occurredTime: time,
					description: orNull(description),
					notes: orNull(notes),
					items: itemized.items.map((item) => ({
						...item,
						amount: item.amount.toString(),
					})),
				},
				wallet.currency,
			),
		);
	};

	const currency = walletOf(walletId)?.currency;
	const chosenCategory = categories.find((c) => c.id === categoryId);
	// The total the Items make, shown once there are some: the receipt total, or their sum when they run over it.
	const shownTotal =
		currency !== undefined && isDecimalAmount(amount.trim())
			? withRest(
					parseMoney(amount.trim(), currency),
					items.map((item) => ({ amount: parseMoney(item.amount, currency) })),
					(rest) => ({ amount: rest }),
				).total
			: null;

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
			{/* Once there are Items the total is a box, the Items' sum when they run over it; the pencil changes it. */}
			{kind === "expense" &&
			items.length > 0 &&
			!changingTotal &&
			shownTotal ? (
				<View className="flex-row items-center justify-between gap-3 rounded-control border-3 border-border p-3">
					<View
						accessibilityLabel={t`Total`}
						accessibilityValue={{ text: formatMoney(shownTotal) }}
						accessible
						className="gap-0.5"
					>
						<Text variant="muted">{t`Total`}</Text>
						<Text variant="figure">{formatMoney(shownTotal)}</Text>
					</View>
					<Chip
						accessibilityLabel={t`Change the total`}
						onPress={() => setChangingTotal(true)}
					>
						<Icon
							as={Pencil}
							size={18}
						/>
					</Chip>
				</View>
			) : (
				<Input
					inputMode="decimal"
					label={currency ? t`Amount (${currency})` : t`Amount`}
					onChangeText={setAmount}
					value={amount}
				/>
			)}
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
			{kind === "expense" && currency !== undefined && (
				<ItemsSection
					category={chosenCategory}
					categoryChoices={categoryChoices}
					currency={currency}
					items={items}
					onChange={setItems}
					startAdding={startItemizing}
					total={amount}
				/>
			)}
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
