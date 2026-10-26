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
import { newId } from "@/lib/ids";

import { useItemNames } from "./labels";
import type { ItemDraft } from "./types";

type Props = {
	/** The Items added so far, the Rest left out: it's what they leave of the total. */
	items: readonly ItemDraft[];
	onChange: (items: ItemDraft[]) => void;
	/** The receipt total as typed, and its Wallet's currency. */
	total: string;
	currency: string;
	/** The Expense's Category: each new Item's default, and the Rest's. */
	category: { id: string; name: string } | undefined;
	/** The Expense list, as the Category picker shows it. */
	categoryChoices: readonly { value: string; label: string }[];
	/** Open the editor for a first Item straight away, say when quick-add's Items chip opened the form. */
	startAdding?: boolean;
};

/** The Item editor's fields, and which Item it edits (none: a new one). */
type Editor = {
	id: string | null;
	description: string;
	amount: string;
	quantity: string;
	categoryId: string;
};

/**
 * An Expense's Items, total first (spec §4.3): add only the Items you want; the dashed Rest holds what's left and is
 * saved as "Other <category>". Items keep the order they were added in; removing one offers Undo.
 */
export const ItemsSection = ({
	items,
	onChange,
	total,
	currency,
	category,
	categoryChoices,
	startAdding = false,
}: Props) => {
	const { t } = useLingui();
	const names = useItemNames();
	const blankEditor = (): Editor => ({
		id: null,
		description: "",
		amount: "",
		quantity: "",
		categoryId: category?.id ?? "",
	});
	const [editor, setEditor] = useState<Editor | null>(
		startAdding ? blankEditor() : null,
	);
	const [removed, setRemoved] = useState<{
		item: ItemDraft;
		index: number;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	const categoryLabel = (id: string) =>
		categoryChoices.find((c) => c.value === id)?.label ?? "";
	const receipt = isDecimalAmount(total.trim())
		? parseMoney(total.trim(), currency)
		: null;
	const itemized = itemize(
		receipt ?? parseMoney("0", currency),
		items.map((item) => parseMoney(item.amount, currency)),
	);

	const saveItem = () => {
		if (!editor) return;
		const description = editor.description.trim();
		const amount = editor.amount.trim();
		if (description === "") return setError(t`Say what the Item is.`);
		if (description.length > 200)
			return setError(t`Keep the description to 200 characters or fewer.`);
		if (!isDecimalAmount(amount))
			return setError(t`Enter an amount like 150 or 150.50.`);
		const money = parseMoney(amount, currency);
		if (isNegative(money) || isZero(money))
			return setError(t`The amount is more than zero.`);
		if (editor.quantity.trim().length > 40)
			return setError(t`Keep the quantity to 40 characters or fewer.`);
		// Opened before the Expense had a Category, an Item takes the Expense's once there is one.
		const categoryId = editor.categoryId || (category?.id ?? "");
		if (!categoryChoices.some((c) => c.value === categoryId))
			return setError(t`Pick a Category.`);
		const item: ItemDraft = {
			id: editor.id ?? newId(),
			description,
			amount,
			quantity: editor.quantity.trim() === "" ? null : editor.quantity.trim(),
			categoryId,
			rest: false,
		};
		onChange(
			editor.id === null
				? [...items, item]
				: items.map((old) => (old.id === editor.id ? item : old)),
		);
		setError(null);
		setEditor(null);
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

	const restName = names.rest(category?.name);
	const restAmount = formatMoney(itemized.rest);
	const grownTotal = formatMoney(itemized.total);
	const removedName = removed?.item.description ?? "";

	return (
		<View className="gap-2">
			<Text variant="label">{t`Items`}</Text>
			{items.length > 0 && (
				<View role="list">
					{items.map((item, index) => {
						const { description } = item;
						return (
							<View
								className="flex-row items-center gap-2 border-b-2 border-border py-1"
								key={item.id}
								role="listitem"
							>
								<Pressable
									accessibilityHint={t`Edit this Item`}
									className="min-h-12 shrink grow justify-center"
									onPress={() =>
										setEditor({
											id: item.id,
											description: item.description,
											amount: item.amount,
											quantity: item.quantity ?? "",
											categoryId: item.categoryId,
										})
									}
									role="button"
								>
									<Text variant="label">
										{names.item(item.description, item.quantity)}
									</Text>
									<Text variant="muted">{categoryLabel(item.categoryId)}</Text>
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
					{!itemized.over && !isZero(itemized.rest) && (
						<View
							accessibilityLabel={t`Rest`}
							accessibilityValue={{ text: t`${restName}, ${restAmount}` }}
							accessible
							className="mt-1 flex-row items-center justify-between gap-2 rounded-control border-2 border-dashed border-border ps-3 pe-3 py-2"
						>
							<Text variant="muted">{restName}</Text>
							<Text variant="muted">{restAmount}</Text>
						</View>
					)}
				</View>
			)}
			{itemized.over && items.length > 0 && (
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
			{editor ? (
				<View className="gap-3 rounded-control border-2 border-border p-3">
					<Input
						label={t`Item`}
						onChangeText={(description) =>
							setEditor({ ...editor, description })
						}
						value={editor.description}
					/>
					<Input
						inputMode="decimal"
						label={t`Item amount (${currency})`}
						onChangeText={(amount) => setEditor({ ...editor, amount })}
						value={editor.amount}
					/>
					<Input
						hint={t`Optional, say "2 kg"; it doesn't change the amount.`}
						label={t`Quantity`}
						onChangeText={(quantity) => setEditor({ ...editor, quantity })}
						value={editor.quantity}
					/>
					<RadioGroup
						compact
						label={t`Item Category`}
						onValueChange={(categoryId) => setEditor({ ...editor, categoryId })}
						options={categoryChoices}
						value={editor.categoryId}
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
							{editor.id === null ? t`Add Item` : t`Save Item`}
						</Button>
						<Button
							onPress={() => {
								setEditor(null);
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
						setEditor(blankEditor());
						setRemoved(null);
					}}
				>
					{items.length === 0 ? t`Add Items` : t`Add another Item`}
				</Chip>
			)}
		</View>
	);
};
