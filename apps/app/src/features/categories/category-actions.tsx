import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
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

import type { Category } from "./types";

type Props = {
	category: Category;
	/** Its parent, when it's a Subcategory. */
	parent: Category | null;
	/** It has Subcategories, which go with it when it's archived. */
	hasSubcategories: boolean;
	/** In use (Subcategories or, once Expenses land, Entries), so it's archived, never deleted. */
	inUse: boolean;
	onArchive: () => Promise<void>;
	onUnarchive: () => Promise<void>;
	onDelete: () => Promise<void>;
};

/** Archive a Category (with its Subcategories), bring it back, or delete it while it's unused (spec §3.3). */
export const CategoryActions = ({
	category,
	parent,
	hasSubcategories,
	inUse,
	onArchive,
	onUnarchive,
	onDelete,
}: Props) => {
	const { t } = useLingui();
	const { name } = category;

	if (category.archived_at !== null) {
		const parentName = parent?.name;
		return parent !== null && parent.archived_at !== null ? (
			<Text
				role="note"
				variant="muted"
			>
				{t`It sits under ${parentName}, which is archived too. Bring ${parentName} back first.`}
			</Text>
		) : (
			<Button
				onPress={() => void onUnarchive()}
				variant="secondary"
			>
				{t`Unarchive`}
			</Button>
		);
	}

	return (
		<View className="flex-row flex-wrap gap-3">
			<Dialog>
				<DialogTrigger asChild>
					<Button variant="secondary">{t`Archive`}</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogTitle>{t`Archive ${name}?`}</DialogTitle>
					<DialogDescription>
						{hasSubcategories
							? t`It leaves your lists with its Subcategories. Everything recorded in them stays, and you can bring it back any time.`
							: t`It leaves your lists. Everything recorded in it stays, and you can bring it back any time.`}
					</DialogDescription>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="secondary">{t`Cancel`}</Button>
						</DialogClose>
						<DialogClose asChild>
							<Button onPress={() => void onArchive()}>
								{t`Archive Category`}
							</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{!inUse && (
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="secondary">{t`Delete`}</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogTitle>{t`Delete ${name}?`}</DialogTitle>
						<DialogDescription>
							{t`Nothing is recorded in it yet, so it's removed for good.`}
						</DialogDescription>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="secondary">{t`Cancel`}</Button>
							</DialogClose>
							<DialogClose asChild>
								<Button onPress={() => void onDelete()}>
									{t`Delete Category`}
								</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</View>
	);
};
