import { CATEGORY_KINDS, type CategoryKind } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";

import { createCategory } from "@/features/categories/actions";
import { CategoryForm } from "@/features/categories/category-form";
import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

const isKind = (value: string | undefined): value is CategoryKind =>
	CATEGORY_KINDS.some((kind) => kind === value);

export default function NewCategory() {
	const { t } = useLingui();
	const params = useLocalSearchParams<{ kind?: string; parent?: string }>();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const all = useCategories(household?.id);
	const canWrite = useCanWrite(household?.id, userId);
	// Viewers can't add Categories, and a link without a list has nothing to add to.
	if (canWrite === false || !isKind(params.kind))
		return <Redirect href="/categories" />;
	if (!household || canWrite === undefined || all === undefined) return null;
	const { kind } = params;
	const title = params.parent ? t`New Subcategory` : t`New Category`;

	return (
		<Screen title={title}>
			<Stack.Screen options={{ title }} />
			<CategoryForm
				categories={all}
				kind={kind}
				onSubmit={async (draft) => {
					await createCategory(household.id, kind, draft);
					if (router.canGoBack()) router.back();
					else router.replace("/categories");
				}}
				parentId={params.parent ?? null}
				submitLabel={params.parent ? t`Add Subcategory` : t`Add Category`}
			/>
		</Screen>
	);
}
