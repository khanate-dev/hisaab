import {
	categoryTree,
	currencyDecimals,
	descriptionSuggestions,
	FLOW_KINDS,
	type FlowKind,
	frequentCategories,
	isDecimalAmount,
	isNegative,
	isZero,
	parseMoney,
	recentDescriptions,
	shiftCalendarDate,
	typeAmountKey,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { CategoryBadge } from "@/features/categories/category-badge";
import type { Category } from "@/features/categories/types";
import { todayIn } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";

import { AmountKeypad } from "./amount-keypad";
import { orNull, recordableWallets, repeatEntry } from "./draft";
import { entryKindLabel } from "./labels";
import type { Entry, EntryDraft, WalletChoice } from "./types";

const DEFAULT_KIND: FlowKind = "expense";
/** How many Categories the grid shows before "All Categories": enough that the usual ones need no scrolling. */
const GRID_SIZE = 6;

type Props = {
	wallets: readonly WalletChoice[];
	categories: readonly Category[];
	/** Past Entries, for Recent chips, the category grid's order and description suggestions. */
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
 * Quick-add (spec §4.2): keypad first, Recent chips above it that repeat an Entry, the category grid below (the
 * household's most used first), and chips for the Wallet, the date (today) and Items. Repeat Entry: ＋ → chip →
 * Save. New Entry: ＋ → digits → category → Save. Transfers join with #37 and Attach with Attachments.
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
	const recordable = recordableWallets(wallets, baseCurrency);
	const [kind, setKind] = useState<FlowKind>(DEFAULT_KIND);
	const [amount, setAmount] = useState("");
	const [categoryId, setCategoryId] = useState("");
	// The default Wallet is the household's first until a default-Wallet setting arrives with personal settings.
	const [walletId, setWalletId] = useState(recordable[0]?.id ?? "");
	const [occurredOn, setOccurredOn] = useState(today);
	const [description, setDescription] = useState("");
	const [picked, setPicked] = useState(false);
	const [choosingWallet, setChoosingWallet] = useState(false);
	const [choosingDate, setChoosingDate] = useState(false);
	const [allCategories, setAllCategories] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const wallet = recordable.find((w) => w.id === walletId);
	const currency = wallet?.currency ?? baseCurrency ?? "";
	const inList = categoryTree(categories, kind).flatMap(
		({ category, subcategories }) => [category, ...subcategories],
	);
	// The grid: the most used first, then top-level Categories, and the chosen one always on it.
	const frequent = frequentCategories(history, kind);
	const grid = allCategories
		? inList
		: [
				...frequent.flatMap((id) => inList.filter((c) => c.id === id)),
				...inList.filter(
					(c) => c.parent_id === null && !frequent.includes(c.id),
				),
			].slice(0, GRID_SIZE);
	const chosen = inList.find((c) => c.id === categoryId);
	if (chosen && !grid.includes(chosen)) grid.push(chosen);
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
		chosen !== undefined &&
		!busy;

	const chooseKind = (next: FlowKind) => {
		setKind(next);
		setCategoryId("");
		setPicked(false);
	};

	/** A Recent chip or a suggestion repeats that Entry. */
	const repeat = (past: Entry) => {
		const filled = repeatEntry(past, categories, wallets, baseCurrency);
		setDescription(filled.description ?? "");
		setPicked(true);
		setAmount(filled.amount);
		setCategoryId(filled.categoryId);
		if (filled.walletId) setWalletId(filled.walletId);
	};

	const draft = (): EntryDraft => ({
		kind,
		amount,
		walletId,
		categoryId,
		occurredOn,
		occurredTime: null,
		description: orNull(description),
		notes: null,
		items: [],
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

	const repeatButtons = (
		entries: readonly Entry[],
		{ accent }: { accent: boolean },
	) => (
		<View className="flex-row flex-wrap gap-2">
			{entries.map((past) => (
				<Chip
					accent={accent}
					accessibilityHint={t`Fills in its Category, Wallet and amount`}
					key={past.id}
					onPress={() => repeat(past)}
				>
					{past.description ?? ""}
				</Chip>
			))}
		</View>
	);

	return (
		<View className="gap-3">
			{/* Kind and amount share a row, so Save stays on screen beneath the keypad and grid. */}
			<View className="flex-row flex-wrap items-center justify-between gap-2">
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
					accessibilityValue={{ text: money ? formatMoney(money) : shown }}
					accessible
					className="shrink grow flex-row items-baseline justify-end gap-2 pe-2"
				>
					<Text variant="muted">{currency}</Text>
					<Text variant="figure">{shown}</Text>
				</View>
			</View>
			{chips.length > 0 && repeatButtons(chips, { accent: true })}
			<AmountKeypad
				onKey={(key) =>
					setAmount((typed) =>
						typeAmountKey(
							typed,
							key,
							wallet ? currencyDecimals(wallet.currency) : 2,
						),
					)
				}
			/>
			<RadioGroup
				compact
				label={t`Category`}
				onValueChange={setCategoryId}
				options={grid.map((category) => ({
					value: category.id,
					label: category.name,
					content: () => (
						<View className="flex-row items-center gap-2 pe-2">
							<CategoryBadge
								color={category.color}
								icon={category.icon}
								size={14}
							/>
							<Text variant="label">{category.name}</Text>
						</View>
					),
				}))}
				value={categoryId}
			/>
			<View className="flex-row flex-wrap gap-2">
				{!allCategories && inList.length > grid.length && (
					<Chip
						onPress={() => setAllCategories(true)}
					>{t`All Categories`}</Chip>
				)}
				<Chip onPress={() => setChoosingWallet((choosing) => !choosing)}>
					{t`Wallet: ${walletName}`}
				</Chip>
				<Chip onPress={() => setChoosingDate((choosing) => !choosing)}>
					{t`Date: ${dateName}`}
				</Chip>
				<Chip onPress={() => onOpenFullForm(draft())}>{t`Items`}</Chip>
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
			{/* Optional and rarely typed, so it sits below Save: Save stays in reach after the keypad. */}
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
				{suggestions.length > 0 &&
					repeatButtons(suggestions, { accent: false })}
			</View>
		</View>
	);
};
