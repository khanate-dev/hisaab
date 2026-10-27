import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { Category } from "@/features/categories/types";
import { formatBudgetMonth, formatDate, formatMoney } from "@/lib/format";

import type { BudgetScope } from "./scope";
import { BudgetForm } from "./budget-form";
import {
	type BudgetLine,
	type BudgetMonthView,
	EXPENSE,
	INCOME,
} from "./types";

type Props = {
	view: BudgetMonthView;
	/** Every Category of the household, for picking which one a Budget is for. */
	categories: readonly Category[];
	/** Admins and Members set Budgets; Viewers only look. */
	canEdit: boolean;
	onPrevious: () => void;
	onNext: () => void;
	onSet: (change: {
		categoryId: string;
		amount: string;
		scope: BudgetScope;
	}) => Promise<void>;
	onStop: (categoryId: string) => Promise<void>;
};

/** What the editor is open on: a list, and the Category when it's changing one already budgeted. */
type Editing = { kind: Category["kind"]; line: BudgetLine | null } | null;

/**
 * A Budget month (spec §3.3): each Budget with what's spent and its Pace ("day 12 of 30, 58% spent"), and each
 * Expected income with what's come in. No rollover: every month starts afresh.
 */
export const BudgetMonth = ({
	view,
	categories,
	canEdit,
	onPrevious,
	onNext,
	onSet,
	onStop,
}: Props) => {
	const { t } = useLingui();
	const [editing, setEditing] = useState<Editing>(null);
	const monthName = formatBudgetMonth(view.first);
	const first = formatDate(view.first);
	const last = formatDate(view.last);
	const { day, days } = view;

	const section = (
		kind: Category["kind"],
		lines: readonly BudgetLine[],
		labels: { title: string; empty: string; add: string },
	) => (
		<View className="gap-3">
			<Text variant="title">{labels.title}</Text>
			{lines.length === 0 ? (
				<Text
					role="status"
					variant="muted"
				>
					{labels.empty}
				</Text>
			) : (
				lines.map((line) => (
					<BudgetRow
						canEdit={canEdit}
						income={kind === INCOME}
						key={line.category.id}
						line={line}
						onEdit={() => setEditing({ kind, line })}
						view={view}
					/>
				))
			)}
			{canEdit && editing?.kind !== kind && (
				<Button
					onPress={() => setEditing({ kind, line: null })}
					variant="secondary"
				>
					{labels.add}
				</Button>
			)}
			{editing?.kind === kind && (
				<BudgetForm
					categories={categories}
					currency={view.currency}
					initial={editing.line}
					kind={kind}
					monthName={monthName}
					onCancel={() => setEditing(null)}
					onStop={async (categoryId) => {
						await onStop(categoryId);
						setEditing(null);
					}}
					onSubmit={async (change) => {
						await onSet(change);
						setEditing(null);
					}}
				/>
			)}
		</View>
	);

	return (
		<View className="gap-6">
			<View className="flex-row items-center justify-between gap-3">
				<Button
					accessibilityLabel={t`Previous Budget month`}
					onPress={onPrevious}
					variant="secondary"
				>
					{t`Previous`}
				</Button>
				<View className="shrink items-center">
					<Text
						role="heading"
						variant="title"
					>
						{monthName}
					</Text>
					<Text variant="muted">{t`${first} to ${last}`}</Text>
				</View>
				<Button
					accessibilityLabel={t`Next Budget month`}
					onPress={onNext}
					variant="secondary"
				>
					{t`Next`}
				</Button>
			</View>
			{view.current && <Text variant="muted">{t`Day ${day} of ${days}`}</Text>}
			{section(EXPENSE, view.budgets, {
				title: t`Budgets`,
				empty: t`No Budgets this month.`,
				add: t`Set a Budget`,
			})}
			{section(INCOME, view.expectedIncome, {
				title: t`Expected income`,
				empty: t`No Expected income this month.`,
				add: t`Set Expected income`,
			})}
		</View>
	);
};

const BudgetRow = ({
	line,
	view,
	income,
	canEdit,
	onEdit,
}: {
	line: BudgetLine;
	view: BudgetMonthView;
	income: boolean;
	canEdit: boolean;
	onEdit: () => void;
}) => {
	const { t } = useLingui();
	const name = line.category.name;
	const used = formatMoney(line.used);
	const budget = formatMoney(line.budget);
	const percent = line.percentUsed;
	const { day, days } = view;
	const amounts = income
		? t`${used} of ${budget} received`
		: t`${used} of ${budget} spent`;
	const paceText =
		percent === null
			? income
				? t`Nothing expected`
				: t`Nothing budgeted`
			: view.current
				? income
					? t`day ${day} of ${days}, ${percent}% received`
					: t`day ${day} of ${days}, ${percent}% spent`
				: income
					? t`${percent}% received`
					: t`${percent}% spent`;
	const ahead = !income && view.current && line.ahead;

	return (
		<Card>
			<View
				accessibilityLabel={name}
				accessibilityValue={{ text: `${amounts}, ${paceText}` }}
				accessible
				className="gap-1"
			>
				<Text variant="label">{name}</Text>
				{line.includesSubcategories && (
					<Text variant="muted">{t`Includes its Subcategories`}</Text>
				)}
				<Text>{amounts}</Text>
				<Text variant="muted">{paceText}</Text>
			</View>
			{ahead && (
				<Text className="text-bad">{t`Spending ahead of the month`}</Text>
			)}
			{canEdit && (
				<Button
					accessibilityLabel={
						income
							? t`Change Expected income for ${name}`
							: t`Change the Budget for ${name}`
					}
					onPress={onEdit}
					variant="secondary"
				>
					{t`Change`}
				</Button>
			)}
		</Card>
	);
};
