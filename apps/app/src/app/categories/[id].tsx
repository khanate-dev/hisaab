import { useLingui } from "@lingui/react/macro";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
	archiveCategory,
	deleteCategory,
	unarchiveCategory,
	updateCategory,
} from "@/features/categories/actions";
import { CategoryActions } from "@/features/categories/category-actions";
import { CategoryForm } from "@/features/categories/category-form";
import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function CategoryScreen() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const all = useCategories(household?.id);
	const canWrite = useCanWrite(household?.id, userId);
	const category = all?.find((c) => c.id === id);

	// Viewers only look at Categories, in the lists.
	if (canWrite === false) return <Redirect href="/categories" />;
	if (all === undefined) return null;
	if (!category) {
		return (
			<Screen title={t`Category`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`This Category isn't here. It may not have synced yet.`}
				</Text>
			</Screen>
		);
	}
	const parent = all.find((c) => c.id === category.parent_id) ?? null;
	const hasSubcategories = all.some((c) => c.parent_id === category.id);

	return (
		<Screen title={category.name}>
			<Stack.Screen options={{ title: category.name }} />
			{category.archived_at !== null && (
				<Text
					role="note"
					variant="label"
				>
					{t`Archived: gone from your lists, everything recorded in it kept.`}
				</Text>
			)}
			<CategoryForm
				categories={all}
				category={category}
				key={category.id}
				kind={category.kind}
				onSubmit={async (draft) => {
					await updateCategory(category.id, draft);
					if (router.canGoBack()) router.back();
					else router.replace("/categories");
				}}
				submitLabel={t`Save`}
			/>
			{category.parent_id === null && category.archived_at === null && (
				<Button
					onPress={() =>
						router.push(
							`/categories/new?kind=${category.kind}&parent=${category.id}`,
						)
					}
					variant="secondary"
				>
					{t`Add Subcategory`}
				</Button>
			)}
			<CategoryActions
				category={category}
				// TODO(#34): Entries in it put it in use too.
				inUse={hasSubcategories}
				onArchive={() => archiveCategory(category.id)}
				onDelete={async () => {
					await deleteCategory(category.id);
					if (router.canGoBack()) router.back();
					else router.replace("/categories");
				}}
				onUnarchive={() => unarchiveCategory(category.id)}
				parent={parent}
			/>
		</Screen>
	);
}
