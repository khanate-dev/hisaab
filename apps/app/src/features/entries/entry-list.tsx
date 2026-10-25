import { isNegative } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { CategoryBadge } from "@/features/categories/category-badge";
import { formatDate, formatMoney } from "@/lib/format";

import { entryKindLabel } from "./labels";
import type { EntryView } from "./views";

/** What an Entry is called in a list: its description, else its Category, else its kind. */
export const useEntryTitle = () => {
	const { i18n } = useLingui();
	return ({ entry, category }: EntryView) =>
		entry.description ?? category?.name ?? i18n._(entryKindLabel(entry.kind));
};

const EntryRow = ({
	view,
	onOpen,
}: {
	view: EntryView;
	onOpen: (entryId: string) => void;
}) => {
	const { t } = useLingui();
	const title = useEntryTitle()(view);
	const { category, parent, wallet, amount } = view;
	const categoryName = category?.name;
	const parentName = parent?.name;
	const walletName = wallet.name;
	const where =
		categoryName === undefined
			? walletName
			: parentName === undefined
				? t`${categoryName} · ${walletName}`
				: t`${parentName} › ${categoryName} · ${walletName}`;

	return (
		<Pressable
			className="min-h-12 flex-row items-center gap-3 py-2"
			onPress={() => onOpen(view.entry.id)}
			role="button"
		>
			{category ? (
				<CategoryBadge
					color={category.color}
					icon={category.icon}
				/>
			) : (
				<View className="size-9" />
			)}
			<View className="shrink grow gap-0.5">
				<Text variant="label">{title}</Text>
				<Text variant="muted">{where}</Text>
			</View>
			<Text
				className={`text-end ${isNegative(amount) ? "" : "text-good"}`}
				variant="label"
			>
				{formatMoney(amount)}
			</Text>
		</Pressable>
	);
};

type Props = {
	items: EntryView[];
	onOpen: (entryId: string) => void;
};

/** Entries newest first, under the date each happened on. */
export const EntryList = ({ items, onOpen }: Props) => {
	const { t } = useLingui();
	if (items.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Entries yet.`}
			</Text>
		);
	}
	// Newest first already, so each day's Entries are together.
	const days = new Map<string, EntryView[]>();
	for (const view of items) {
		const day = view.entry.occurred_on;
		days.set(day, [...(days.get(day) ?? []), view]);
	}
	return (
		<View className="gap-4">
			{[...days].map(([day, views]) => (
				<View
					className="gap-1"
					key={day}
				>
					<Text
						role="heading"
						variant="label"
					>
						{formatDate(day)}
					</Text>
					<View role="list">
						{views.map((view) => (
							<View
								className="border-b-2 border-border"
								key={view.entry.id}
								role="listitem"
							>
								<EntryRow
									onOpen={onOpen}
									view={view}
								/>
							</View>
						))}
					</View>
				</View>
			))}
		</View>
	);
};
