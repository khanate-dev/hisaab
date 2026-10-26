import {
	categoryTree,
	currencyDecimals,
	descriptionSuggestions,
	FLOW_KINDS,
	type FlowKind,
	isDecimalAmount,
	isNegative,
	isZero,
	magnitude,
	parseMoney,
	recentDescriptions,
	shiftCalendarDate,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { CategoryBadge } from "@/features/categories/category-badge";
import type { Category } from "@/features/categories/types";
import { todayIn } from "@/lib/dates";
import { formatDate } from "@/lib/format";

import { AmountKeypad } from "./amount-keypad";
import { pressKey } from "./keypad";
import { entryKindLabel } from "./labels";
import type { Entry, EntryDraft, WalletChoice } from "./types";

const DEFAULT_KIND: FlowKind = "expense";

type Props = {
	wallets: readonly WalletChoice[];
	categories: readonly Category[];
	/** Past Entries, for Recent chips and description suggestions. */
	history: readonly Entry[];
	/** Entries go into Base-currency Wallets only until Base amounts land (#45); null before there is one. */
	baseCurrency: string | null;
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	onSubmit: (draft: EntryDraft, currency: string) => Promise<void>;
	/** Items, or anything else quick-add doesn't do, continue in the full form with what's entered so far. */
	onOpenFullForm: (draft: Partial<EntryDraft>) => void;
};

/**
 * Quick-add (spec §4.2): keypad first, Recent chips above it that repeat an Entry, the category grid below, and
 * chips for the Wallet (the default one), the date (today) and Items. Repeat Entry: ＋ → chip → Save. New Entry:
 * ＋ → digits → category → Save. Transfers join with #37 and Attach with Attachments.
 */
export const QuickAddForm = ({
	wallets,
	categories,
	history,
	baseCurrency,
	timeZone,
	today = todayIn(timeZone),
	onSubmit,
	onOpenFullForm,
}: Props) => {
	const { t, i18n } = useLingui();
	const recordable = wallets.filter(
		(w) =>
			w.archived_at === null &&
			(baseCurrency === null || w.currency === baseCurrency),
	);
	const [kind, setKind] = useState<FlowKind>(DEFAULT_KIND);
	const [amount, setAmount] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [walletId, setWalletId] = useState(recordable[0]?.id ?? "");
	const [occurredOn, setOccurredOn] = useState(today);
	const [description, setDescription] = useState("");
	const [picked, setPicked] = useState(false);
	const [choosingWallet, setChoosingWallet] = useState(false);
	const [choosingDate, setChoosingDate] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const wallet = recordable.find((w) => w.id === walletId);
	const currency = wallet?.currency ?? baseCurrency ?? "";
	const decimals = currency ? currencyDecimals(currency) : 2;
	const categoryChoices = categoryTree(categories, kind).flatMap(
		({ category, subcategories }) => [category, ...subcategories],
	);
	const chips = recentDescriptions(history, kind, { limit: 4 });
	const suggestions = picked
		? []
		: descriptionSuggestions(history, description, kind, 3);
	const money =
		wallet && isDecimalAmount(amount)
			? parseMoney(amount, wallet.currency)
			: null;
	const ready =
		money !== null &&
		!isNegative(money) &&
		!isZero(money) &&
		categoryChoices.some((c) => c.id === categoryId) &&
		!busy;

	const chooseKind = (next: FlowKind) => {
		setKind(next);
		setCategoryId("");
		setPicked(false);
	};

	/** A Recent chip or a suggestion repeats that Entry: its description, Category, Wallet and amount. */
	const repeat = (past: Entry) => {
		setDescription(past.description ?? "");
		setPicked(true);
		const category = categories.find((c) => c.id === past.category_id);
		if (category && category.archived_at === null) setCategoryId(category.id);
		const pastWallet = recordable.find((w) => w.id === past.wallet_id);
		if (pastWallet) {
			setWalletId(pastWallet.id);
			setAmount(
				magnitude(parseMoney(past.amount, pastWallet.currency)).toString(),
			);
		}
	};

	const draft = (): EntryDraft => ({
		kind,
		amount,
		walletId,
		categoryId,
		occurredOn,
		occurredTime: null,
		description: description.trim() === "" ? null : description.trim(),
		notes: null,
	});

	const save = async () => {
		if (!ready || !wallet) return;
		setBusy(true);
		setFailed(false);
		try {
			await onSubmit(draft(), wallet.currency);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	};

	const yesterday = shiftCalendarDate(today, -1);
	const walletName = wallet?.name ?? "";
	const dateName =
		occurredOn === today
			? t`Today`
			: occurredOn === yesterday
				? t`Yesterday`
				: formatDate(occurredOn);
	const shown = amount === "" ? "0" : amount;

	return (
		<View className="gap-3">
			<RadioGroup
				label={t`Kind`}
				onValueChange={chooseKind}
				options={FLOW_KINDS.map((value) => ({
					value,
					label: i18n._(entryKindLabel(value)),
				}))}
				value={kind}
			/>
			<View
				accessibilityLabel={t`Amount`}
				accessibilityValue={{ text: currency ? `${currency} ${shown}` : shown }}
				accessible
				className="flex-row items-baseline justify-end gap-2 pe-2"
			>
				<Text variant="muted">{currency}</Text>
				<Text variant="figure">{shown}</Text>
			</View>
			{chips.length > 0 && (
				<View className="flex-row flex-wrap gap-2">
					{chips.map((past) => (
						<Button
							accessibilityHint={t`Fills in its Category, Wallet and amount`}
							key={past.id}
							onPress={() => repeat(past)}
							variant="accent"
						>
							{past.description ?? ""}
						</Button>
					))}
				</View>
			)}
			<AmountKeypad
				onKey={(key) => setAmount((typed) => pressKey(typed, key, decimals))}
			/>
			{/* One scrolling row, so the keypad, the chips and Save all fit on a phone without scrolling the sheet. */}
			<ScrollView
				horizontal
				keyboardShouldPersistTaps="handled"
				showsHorizontalScrollIndicator={false}
			>
				<RadioGroup
					label={t`Category`}
					onValueChange={setCategoryId}
					options={categoryChoices.map((category) => ({
						value: category.id,
						label: category.name,
						content: () => (
							<View className="flex-row items-center gap-2 pe-2">
								<CategoryBadge
									color={category.color}
									icon={category.icon}
									size={16}
								/>
								<Text variant="label">{category.name}</Text>
							</View>
						),
					}))}
					value={categoryId}
				/>
			</ScrollView>
			<View className="flex-row flex-wrap gap-2">
				<Button
					onPress={() => setChoosingWallet((choosing) => !choosing)}
					variant="secondary"
				>
					{t`Wallet: ${walletName}`}
				</Button>
				<Button
					onPress={() => setChoosingDate((choosing) => !choosing)}
					variant="secondary"
				>
					{t`Date: ${dateName}`}
				</Button>
				<Button
					onPress={() => onOpenFullForm(draft())}
					variant="secondary"
				>
					{t`Items`}
				</Button>
			</View>
			{choosingWallet && (
				<RadioGroup
					label={t`Wallet`}
					onValueChange={(id) => {
						setWalletId(id);
						setChoosingWallet(false);
					}}
					options={recordable.map((w) => ({ value: w.id, label: w.name }))}
					value={walletId}
				/>
			)}
			{choosingDate && (
				<RadioGroup
					label={t`Date`}
					onValueChange={(date) => {
						setOccurredOn(date);
						setChoosingDate(false);
					}}
					options={[
						{ value: today, label: t`Today` },
						{ value: yesterday, label: t`Yesterday` },
					]}
					value={occurredOn}
				/>
			)}
			{failed && (
				<Text
					className="text-bad"
					role="alert"
				>
					{t`That didn't save. Try again.`}
				</Text>
			)}
			<Button
				disabled={!ready}
				onPress={() => void save()}
			>
				{t`Save`}
			</Button>
			<View className="gap-2">
				<Input
					hint={t`Optional.`}
					label={t`Description`}
					onChangeText={(text) => {
						setDescription(text);
						setPicked(false);
					}}
					value={description}
				/>
				{suggestions.length > 0 && (
					<View className="flex-row flex-wrap gap-2">
						{suggestions.map((past) => (
							<Button
								accessibilityHint={t`Fills in its Category, Wallet and amount`}
								key={past.id}
								onPress={() => repeat(past)}
								variant="secondary"
							>
								{past.description ?? ""}
							</Button>
						))}
					</View>
				)}
			</View>
		</View>
	);
};
