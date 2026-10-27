import {
	categoryTree,
	isDecimalAmount,
	isNegative,
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
import { useSave } from "@/features/entries/form-checks";

import { type BudgetScope, ONLY_THIS_MONTH, ONWARD } from "./scope";
import { type BudgetLine, INCOME } from "./types";

type Props = {
	/** Expense Categories take a Budget; income ones take Expected income. */
	kind: Category["kind"];
	categories: readonly Category[];
	/** The Budget being changed; null when setting a new one. */
	initial: BudgetLine | null;
	currency: string;
	/** The Budget month it's set in, for display. */
	monthName: string;
	onSubmit: (change: {
		categoryId: string;
		amount: string;
		scope: BudgetScope;
	}) => Promise<void>;
	onStop: (categoryId: string) => Promise<void>;
	onCancel: () => void;
};

/**
 * Sets a Budget, or Expected income, for a Category: from this Budget month on (a standing amount, until changed), or
 * only for this one (a Budget override). A standing one can be stopped from this month on.
 */
export const BudgetForm = ({
	kind,
	categories,
	initial,
	currency,
	monthName,
	onSubmit,
	onStop,
	onCancel,
}: Props) => {
	const { t } = useLingui();
	const { busy, error, setError, save } = useSave();
	const choices = categoryTree(categories, kind).flatMap(
		({ category, subcategories }) => [
			{ value: category.id, label: category.name },
			...subcategories.map(({ id, name }) => {
				const parent = category.name;
				return { value: id, label: t`${parent}: ${name}` };
			}),
		],
	);
	const [categoryId, setCategoryId] = useState(
		initial?.category.id ?? choices[0]?.value ?? "",
	);
	const [amount, setAmount] = useState(initial?.budget.toString() ?? "");
	const [scope, setScope] = useState<BudgetScope>(
		initial?.overridden ? ONLY_THIS_MONTH : ONWARD,
	);
	const income = kind === INCOME;

	const submit = async () => {
		const typed = amount.trim();
		if (!isDecimalAmount(typed) || isNegative(parseMoney(typed, currency)))
			return setError(t`Enter an amount of zero or more, like 30000.`);
		if (!categoryId) return setError(t`Pick a Category.`);
		await save(() => onSubmit({ categoryId, amount: typed, scope }));
	};

	return (
		<View className="gap-3 rounded-control border-2 border-border p-3">
			{initial ? (
				<Text variant="label">{initial.category.name}</Text>
			) : (
				<RadioGroup
					label={t`Category`}
					onValueChange={setCategoryId}
					options={choices}
					value={categoryId}
				/>
			)}
			<Input
				inputMode="decimal"
				label={
					income ? t`Expected income (${currency})` : t`Budget (${currency})`
				}
				onChangeText={setAmount}
				value={amount}
			/>
			<RadioGroup
				label={t`For`}
				onValueChange={setScope}
				options={[
					{ value: ONWARD, label: t`${monthName} on` },
					{ value: ONLY_THIS_MONTH, label: t`Only ${monthName}` },
				]}
				value={scope}
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
				<Button
					disabled={busy}
					onPress={() => void submit()}
				>
					{income ? t`Save Expected income` : t`Save Budget`}
				</Button>
				{initial && (
					<Button
						disabled={busy}
						onPress={() => void save(() => onStop(initial.category.id))}
						variant="secondary"
					>
						{t`Stop from ${monthName}`}
					</Button>
				)}
				<Button
					onPress={onCancel}
					variant="secondary"
				>
					{t`Cancel`}
				</Button>
			</View>
		</View>
	);
};
