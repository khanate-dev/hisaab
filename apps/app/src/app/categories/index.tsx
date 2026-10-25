import { CATEGORY_KINDS, type CategoryKind } from "@hisaab/client-schema";
import { archivedCategories, categoryTree } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import {
	ArchivedCategoryList,
	CategoryList,
} from "@/features/categories/category-list";
import { CATEGORY_KIND_LABELS } from "@/features/categories/labels";
import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

const DEFAULT_KIND: CategoryKind = "expense";

export default function Categories() {
	const { t, i18n } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const all = useCategories(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const [kind, setKind] = useState(DEFAULT_KIND);
	const [showArchived, setShowArchived] = useState(false);
	const open = canWrite
		? (id: string) => router.push(`/categories/${id}`)
		: undefined;

	return (
		<Screen title={showArchived ? t`Archived Categories` : t`Categories`}>
			<RadioGroup
				label={t`List`}
				onValueChange={setKind}
				options={CATEGORY_KINDS.map((value) => ({
					value,
					label: i18n._(CATEGORY_KIND_LABELS[value]),
				}))}
				value={kind}
			/>
			{canWrite && !showArchived && (
				<Button onPress={() => router.push(`/categories/new?kind=${kind}`)}>
					{t`Add Category`}
				</Button>
			)}
			{all === undefined ? null : showArchived ? (
				<ArchivedCategoryList
					items={archivedCategories(all, kind)}
					onOpen={open}
				/>
			) : (
				<CategoryList
					onOpen={open}
					tree={categoryTree(all, kind)}
				/>
			)}
			<Button
				onPress={() => setShowArchived((value) => !value)}
				variant="secondary"
			>
				{showArchived ? t`Show active Categories` : t`Show archived Categories`}
			</Button>
		</Screen>
	);
}
