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
import { entryKindLabel } from "./labels";
import type { EntryView } from "./views";

type Props = {
	view: EntryView;
	/** The name of the User who recorded it, once their profile has synced. */
	recordedBy: string | undefined;
	/** Admins and Members edit and delete Expenses and Incomes; Viewers only look. */
	canEdit: boolean;
	onEdit: () => void;
	onDelete: () => Promise<void>;
};

const Field = ({ label, value }: { label: string; value: string }) => (
	<View className="gap-0.5">
		<Text variant="muted">{label}</Text>
		<Text variant="label">{value}</Text>
	</View>
);

/** One Entry: how much, where, when, and who recorded it. */
export const EntryDetail = ({
	view,
	recordedBy,
	canEdit,
	onEdit,
	onDelete,
}: Props) => {
	const { t, i18n } = useLingui();
	const title = useEntryTitle()(view);
	const { entry, category, parent, wallet, amount } = view;
	const editable =
		canEdit && (entry.kind === "expense" || entry.kind === "income");
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
					<View className="shrink gap-1">
						<Text variant="muted">{i18n._(entryKindLabel(entry.kind))}</Text>
						<Text variant="figure">{formatMoney(amount)}</Text>
					</View>
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
			<Field
				label={t`Wallet`}
				value={wallet.name}
			/>
			<Field
				label={t`Date`}
				value={time === null ? day : t`${day} at ${time}`}
			/>
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
			{editable && (
				<View className="flex-row flex-wrap gap-3">
					<Button
						onPress={onEdit}
						variant="secondary"
					>
						{t`Edit`}
					</Button>
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="secondary">{t`Delete`}</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogTitle>{t`Delete ${title}?`}</DialogTitle>
							<DialogDescription>
								{t`Its Wallet's Balance changes back as if it never happened.`}
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
				</View>
			)}
		</View>
	);
};
