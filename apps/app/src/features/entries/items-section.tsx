import {
	isDecimalAmount,
	isNegative,
	isZero,
	itemize,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

import type { ItemDraft } from "./types";

/** An Item being split out, with a key for the list (Items have no id until they're saved). */
export type SplitItem = ItemDraft & { key: string };

type Props = {
	items: readonly SplitItem[];
	onChange: (items: SplitItem[]) => void;
	/** The receipt total as typed, and its Wallet's currency. */
	total: string;
	currency: string;
	/** The Expense's Category: each new Item's default, and the Rest's. */
	category: { id: string; name: string } | undefined;
	/** The Expense list, as the Category picker shows it. */
	categoryChoices: readonly { value: string; label: string }[];
	/** Open the editor for a first Item straight away, say when quick-add's Items chip opened the form. */
	startSplitting?: boolean;
	newKey: () => string;
};

type Editing = {
	index: number | null;
	description: string;
	amount: string;
	quantity: string;
	categoryId: string;
};

/**
 * An Expense's Items, total first (spec §4.3): split out only the Items you want; the dashed Rest holds what's left
 * and is saved as "Other <category>". Items keep the order they were added in; removing one offers Undo.
 */
export const ItemsSection = ({
	items,
	onChange,
	total,
	currency,
	category,
	categoryChoices,
	startSplitting = false,
	newKey,
}: Props) => {
	const { t } = useLingui();
	const fresh = (): Editing => ({
		index: null,
		description: "",
		amount: "",
		quantity: "",
		categoryId: category?.id ?? "",
	});
	const [editing, setEditing] = useState<Editing | null>(
		startSplitting ? fresh() : null,
	);
	const [removed, setRemoved] = useState<{
		item: SplitItem;
		index: number;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	const labelOf = (id: string) =>
		categoryChoices.find((c) => c.value === id)?.label ?? "";
	const receipt = isDecimalAmount(total.trim())
		? parseMoney(total.trim(), currency)
		: null;
	const split = itemize(
		receipt ?? parseMoney("0", currency),
		items.map((item) => parseMoney(item.amount, currency)),
	);

	const saveItem = () => {
		if (!editing) return;
		const description = editing.description.trim();
		const amount = editing.amount.trim();
		if (description === "") return setError(t`Say what the Item is.`);
		if (description.length > 200)
			return setError(t`Keep the description to 200 characters or fewer.`);
		if (!isDecimalAmount(amount))
			return setError(t`Enter an amount like 150 or 150.50.`);
		const money = parseMoney(amount, currency);
		if (isNegative(money) || isZero(money))
			return setError(t`The amount is more than zero.`);
		if (editing.quantity.trim().length > 40)
			return setError(t`Keep the quantity to 40 characters or fewer.`);
		// Opened before the Expense had a Category, an Item takes the Expense's once there is one.
		const categoryId = editing.categoryId || (category?.id ?? "");
		if (!categoryChoices.some((c) => c.value === categoryId))
			return setError(t`Pick a Category.`);
		const item: SplitItem = {
			key:
				editing.index === null
					? newKey()
					: (items[editing.index]?.key ?? newKey()),
			description,
			amount,
			quantity: editing.quantity.trim() === "" ? null : editing.quantity.trim(),
			categoryId,
		};
		onChange(
			editing.index === null
				? [...items, item]
				: items.map((old, index) => (index === editing.index ? item : old)),
		);
		setError(null);
		setEditing(null);
		setRemoved(null);
	};

	const remove = (index: number) => {
		const item = items[index];
		if (!item) return;
		onChange(items.filter((_, i) => i !== index));
		setRemoved({ item, index });
	};

	const undo = () => {
		if (!removed) return;
		onChange([
			...items.slice(0, removed.index),
			removed.item,
			...items.slice(removed.index),
		]);
		setRemoved(null);
	};

	const categoryName = category?.name ?? "";
	const removedName = removed?.item.description ?? "";
	const grownTotal = formatMoney(split.total);
	const restAmount = formatMoney(split.rest);

	return (
		<View className="gap-2">
			<Text variant="label">{t`Items`}</Text>
			{items.length > 0 && (
				<View role="list">
					{items.map((item, index) => {
						const { description, quantity } = item;
						const where = labelOf(item.categoryId);
						return (
							<View
								className="flex-row items-center gap-2 border-b-2 border-border py-1"
								key={item.key}
								role="listitem"
							>
								<Pressable
									accessibilityHint={t`Edit this Item`}
									className="min-h-12 shrink grow justify-center"
									onPress={() =>
										setEditing({
											index,
											description: item.description,
											amount: item.amount,
											quantity: item.quantity ?? "",
											categoryId: item.categoryId,
										})
									}
									role="button"
								>
									<Text variant="label">
										{quantity === null
											? description
											: t`${description} × ${quantity}`}
									</Text>
									<Text variant="muted">{where}</Text>
								</Pressable>
								<Text variant="label">
									{formatMoney(parseMoney(item.amount, currency))}
								</Text>
								<Chip
									accessibilityLabel={t`Remove ${description}`}
									onPress={() => remove(index)}
								>
									{t`Remove`}
								</Chip>
							</View>
						);
					})}
					{!split.over && !isZero(split.rest) && (
						<View
							accessibilityLabel={t`Rest`}
							accessibilityValue={{
								text: t`Other ${categoryName}, ${restAmount}`,
							}}
							accessible
							className="mt-1 flex-row items-center justify-between gap-2 rounded-control border-2 border-dashed border-border ps-3 pe-3 py-2"
						>
							<Text variant="muted">{t`Other ${categoryName}`}</Text>
							<Text variant="muted">{formatMoney(split.rest)}</Text>
						</View>
					)}
				</View>
			)}
			{split.over && items.length > 0 && (
				<Text
					className="text-warn"
					role="alert"
				>
					{t`The Items add up to more than the total, so the total is now ${grownTotal}.`}
				</Text>
			)}
			{removed && (
				<View className="flex-row items-center gap-2">
					<Text
						role="status"
						variant="muted"
					>
						{t`Removed ${removedName}.`}
					</Text>
					<Chip onPress={undo}>{t`Undo`}</Chip>
				</View>
			)}
			{editing ? (
				<View className="gap-3 rounded-control border-2 border-border p-3">
					<Input
						label={t`Item`}
						onChangeText={(description) =>
							setEditing({ ...editing, description })
						}
						value={editing.description}
					/>
					<Input
						inputMode="decimal"
						label={t`Item amount (${currency})`}
						onChangeText={(amount) => setEditing({ ...editing, amount })}
						value={editing.amount}
					/>
					<Input
						hint={t`Optional, say "2 kg"; it doesn't change the amount.`}
						label={t`Quantity`}
						onChangeText={(quantity) => setEditing({ ...editing, quantity })}
						value={editing.quantity}
					/>
					<RadioGroup
						compact
						label={t`Item Category`}
						onValueChange={(categoryId) =>
							setEditing({ ...editing, categoryId })
						}
						options={categoryChoices}
						value={editing.categoryId}
					/>
					{error !== null && (
						<Text
							className="text-bad"
							role="alert"
						>
							{error}
						</Text>
					)}
					<View className="flex-row flex-wrap gap-2">
						<Button onPress={saveItem}>
							{editing.index === null ? t`Add Item` : t`Save Item`}
						</Button>
						<Button
							onPress={() => {
								setEditing(null);
								setError(null);
							}}
							variant="secondary"
						>
							{t`Cancel`}
						</Button>
					</View>
				</View>
			) : (
				<Chip
					onPress={() => {
						setEditing(fresh());
						setRemoved(null);
					}}
				>
					{items.length === 0 ? t`Split into Items` : t`Add another Item`}
				</Chip>
			)}
		</View>
	);
};
