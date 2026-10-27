import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { CategoryBadge } from "@/features/categories/category-badge";
import { formatDate, formatMoney } from "@/lib/format";

import { useEntryTitle } from "./entry-list";
import { isDeletableKind, isEditableKind } from "./draft";
import { entryKindLabel, useItemNames } from "./labels";
import { type EntryView, shownAmount } from "./views";

type Props = {
	view: EntryView;
	/** The name of the User who recorded it, once their profile has synced. */
	recordedBy: string | undefined;
	/** Admins and Members edit and delete Expenses and Incomes; Viewers only look. */
	canEdit: boolean;
	/** What this User may do to it beyond their Role (`entryRights`); everything, when absent. */
	rights?: { edit: boolean; delete: boolean } | undefined;
	onEdit: () => void;
	onDelete: () => Promise<void>;
	/** Opens the Loan a principal or Repayment belongs to. */
	onOpenLoan?: (() => void) | undefined;
};

/** A labelled value, read as one: "Category, Food › Groceries". */
const Field = ({
	label,
	value,
	figure = false,
}: {
	label: string;
	value: string;
	figure?: boolean;
}) => (
	<View
		accessibilityLabel={label}
		accessibilityValue={{ text: value }}
		accessible
		className="gap-0.5"
	>
		<Text variant="muted">{label}</Text>
		<Text variant={figure ? "figure" : "label"}>{value}</Text>
	</View>
);

/** One Entry: how much, where, when, and who recorded it. */
export const EntryDetail = ({
	view,
	recordedBy,
	canEdit,
	rights = { edit: true, delete: true },
	onEdit,
	onDelete,
	onOpenLoan,
}: Props) => {
	const { t, i18n } = useLingui();
	const title = useEntryTitle()(view);
	const names = useItemNames();
	const { entry, category, parent, wallet, arrival } = view;
	// Every Entry can be deleted; a Balance adjustment is re-recorded rather than edited.
	const editable = canEdit && rights.edit && isEditableKind(entry.kind);
	const toName = arrival?.wallet.name;
	const received =
		arrival && arrival.wallet.currency !== wallet.currency
			? formatMoney(arrival.amount)
			: null;
	const day = formatDate(entry.occurred_on);
	const time = entry.occurred_time;
	const categoryName = category?.name;
	const parentName = parent?.name;

	return (
		<View className="gap-4">
			<Card>
				<View className="flex-row flex-wrap items-center gap-3">
					{category && (
						<CategoryBadge
							color={category.color}
							icon={category.icon}
							size={28}
						/>
					)}
					<Field
						figure
						label={i18n._(entryKindLabel(entry.kind))}
						value={formatMoney(shownAmount(view))}
					/>
				</View>
			</Card>
			{entry.description !== null && (
				<Field
					label={t`Description`}
					value={title}
				/>
			)}
			{categoryName !== undefined && (
				<Field
					label={t`Category`}
					value={
						parentName === undefined
							? categoryName
							: t`${parentName} › ${categoryName}`
					}
				/>
			)}
			{toName === undefined ? (
				<Field
					label={t`Wallet`}
					value={wallet.name}
				/>
			) : (
				<>
					<Field
						label={t`From`}
						value={wallet.name}
					/>
					<Field
						label={t`To`}
						value={toName}
					/>
					{received !== null && (
						<Field
							label={t`Received`}
							value={received}
						/>
					)}
				</>
			)}
			<Field
				label={t`Date`}
				value={time === null ? day : t`${day} at ${time}`}
			/>
			{view.items.length > 0 && (
				<View className="gap-1">
					<Text variant="muted">{t`Items`}</Text>
					<View role="list">
						{view.items.map(
							({ item, amount: itemAmount, category: itemCategory }) => {
								const { description, quantity } = item;
								const where = itemCategory?.name ?? "";
								const name = names.item(description, quantity);
								const shown = formatMoney(itemAmount);
								return (
									<View
										accessibilityLabel={name}
										accessibilityValue={{ text: t`${where}, ${shown}` }}
										accessible
										className="flex-row items-center justify-between gap-3 border-b-2 border-border py-2"
										key={item.id}
										role="listitem"
									>
										<View className="shrink gap-0.5">
											<Text variant="label">{name}</Text>
											<Text variant="muted">{where}</Text>
										</View>
										<Text variant="label">{shown}</Text>
									</View>
								);
							},
						)}
					</View>
				</View>
			)}
			{entry.notes !== null && (
				<Field
					label={t`Notes`}
					value={entry.notes}
				/>
			)}
			{recordedBy !== undefined && (
				<Field
					label={t`Recorded by`}
					value={recordedBy}
				/>
			)}
			{canEdit && (
				<View className="flex-row flex-wrap gap-3">
					{editable && (
						<Button
							onPress={onEdit}
							variant="secondary"
						>
							{t`Edit`}
						</Button>
					)}
					{onOpenLoan && (
						<Button
							onPress={onOpenLoan}
							variant="secondary"
						>
							{t`Open Loan`}
						</Button>
					)}
					{!rights.delete ? (
						<Text
							role="note"
							variant="muted"
						>
							{t`Only whoever made this cross-household transfer changes it.`}
						</Text>
					) : isDeletableKind(entry.kind) ? (
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="secondary">{t`Delete`}</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogTitle>{t`Delete ${title}?`}</DialogTitle>
								<DialogDescription>
									{entry.link_id !== null
										? t`Its other half, in the other household, goes too, and both Balances change back.`
										: arrival
											? t`Both Wallets' Balances change back as if it never happened.`
											: t`Its Wallet's Balance changes back as if it never happened.`}
								</DialogDescription>
								<DialogFooter>
									<DialogClose asChild>
										<Button variant="secondary">{t`Cancel`}</Button>
									</DialogClose>
									<DialogClose asChild>
										<Button
											onPress={() => void onDelete()}
										>{t`Delete Entry`}</Button>
									</DialogClose>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					) : (
						<Text
							role="note"
							variant="muted"
						>
							{t`A Loan's principal is deleted along with its Loan.`}
						</Text>
					)}
				</View>
			)}
		</View>
	);
};
