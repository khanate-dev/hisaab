import type { CategoryNode } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";

import { CategoryBadge } from "./category-badge";
import type { Category } from "./types";

type RowProps = {
	category: Category;
	/** What a screen reader says for the row: indenting a Subcategory only shows where it sits. */
	label: string;
	/** A second line, say the parent of an archived Subcategory. */
	detail?: string | undefined;
	onOpen?: ((categoryId: string) => void) | undefined;
};

const CategoryRow = ({ category, label, detail, onOpen }: RowProps) => {
	const content = (
		<>
			<CategoryBadge
				color={category.color}
				icon={category.icon}
			/>
			<View className="shrink gap-0.5">
				<Text variant="label">{category.name}</Text>
				{detail !== undefined && <Text variant="muted">{detail}</Text>}
			</View>
		</>
	);
	const className = "min-h-12 flex-row items-center gap-3 py-2";
	return onOpen ? (
		<Pressable
			accessibilityLabel={label}
			className={className}
			onPress={() => onOpen(category.id)}
			role="button"
		>
			{content}
		</Pressable>
	) : (
		<View
			accessibilityLabel={label}
			accessible
			className={className}
		>
			{content}
		</View>
	);
};

type Props = {
	tree: CategoryNode<Category>[];
	/** Opens a Category to edit; without it the list is read-only. */
	onOpen?: ((categoryId: string) => void) | undefined;
};

/** One list's Categories, each with its Subcategories beneath it. */
export const CategoryList = ({ tree, onOpen }: Props) => {
	const { t } = useLingui();
	if (tree.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Categories in this list yet.`}
			</Text>
		);
	}
	return (
		<View role="list">
			{tree.map(({ category, subcategories }) => (
				<View
					className="border-b-2 border-border py-1"
					key={category.id}
					role="listitem"
				>
					<CategoryRow
						category={category}
						label={category.name}
						onOpen={onOpen}
					/>
					{subcategories.length > 0 && (
						<View
							className="ps-8"
							role="list"
						>
							{subcategories.map((sub) => {
								const { name } = sub;
								const parentName = category.name;
								return (
									<View
										key={sub.id}
										role="listitem"
									>
										<CategoryRow
											category={sub}
											label={t`${name}, in ${parentName}`}
											onOpen={onOpen}
										/>
									</View>
								);
							})}
						</View>
					)}
				</View>
			))}
		</View>
	);
};

/** One list's archived Categories; a Subcategory says which Category it was under. */
export const ArchivedCategoryList = ({
	items,
	onOpen,
}: {
	items: { category: Category; parent: Category | null }[];
	onOpen?: ((categoryId: string) => void) | undefined;
}) => {
	const { t } = useLingui();
	if (items.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No archived Categories in this list.`}
			</Text>
		);
	}
	return (
		<View role="list">
			{items.map(({ category, parent }) => {
				const { name } = category;
				const parentName = parent?.name;
				const detail =
					parentName === undefined ? undefined : t`Under ${parentName}`;
				return (
					<View
						className="border-b-2 border-border py-1"
						key={category.id}
						role="listitem"
					>
						<CategoryRow
							category={category}
							detail={detail}
							label={
								detail === undefined ? name : t`${name}, under ${parentName}`
							}
							onOpen={onOpen}
						/>
					</View>
				);
			})}
		</View>
	);
};
