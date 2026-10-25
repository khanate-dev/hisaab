import type { CategoryKind } from "@hisaab/client-schema";
import { parentChoices } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import {
	CATEGORY_ICONS,
	type CategoryIconKey,
	categoryIcon,
	Icon,
} from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { useColors } from "@/theme/theme";
import {
	CATEGORY_COLORS,
	type CategoryColorKey,
	categoryColor,
} from "@/theme/tokens";

import { CATEGORY_COLOR_LABELS, CATEGORY_ICON_LABELS } from "./labels";
import type { Category, CategoryDraft } from "./types";

const ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];
const COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColorKey[];
/** The parent choice for a top-level Category; ids are never empty. */
const TOP_LEVEL = "";
const DEFAULT_ICON: CategoryIconKey = "gifts";
const DEFAULT_COLOR: CategoryColorKey = "butter";

type Props = {
	kind: CategoryKind;
	/** The household's Categories, for where this one may sit. */
	categories: readonly Category[];
	/** The Category being edited; absent when adding one. */
	category?: Category;
	/** Where a new Category starts, say under the parent it was added from. */
	parentId?: string | null;
	submitLabel: string;
	onSubmit: (draft: CategoryDraft) => Promise<void>;
};

/** Add or edit a Category: its name, icon, colour and, for a Subcategory, the Category it sits under. */
export const CategoryForm = ({
	kind,
	categories,
	category,
	parentId: initialParentId = null,
	submitLabel,
	onSubmit,
}: Props) => {
	const { t, i18n } = useLingui();
	const colors = useColors();
	const startParent = categories.find(
		(c) => c.id === (category?.parent_id ?? initialParentId),
	);
	const [name, setName] = useState(category?.name ?? "");
	const [icon, setIcon] = useState(
		category?.icon ?? startParent?.icon ?? DEFAULT_ICON,
	);
	const [color, setColor] = useState(
		category?.color ?? startParent?.color ?? DEFAULT_COLOR,
	);
	const [parent, setParent] = useState(startParent?.id ?? TOP_LEVEL);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const eligible = parentChoices(categories, kind, category?.id ?? null);
	// Its current parent stays on offer even when archived, so the choice always shows where it sits.
	const choices =
		startParent && !eligible.includes(startParent)
			? [startParent, ...eligible]
			: eligible;

	const submit = async () => {
		const trimmed = name.trim();
		if (trimmed === "") return setError(t`Give the Category a name.`);
		if (trimmed.length > 60)
			return setError(t`Keep the name to 60 characters or fewer.`);
		setError(null);
		setBusy(true);
		try {
			await onSubmit({
				name: trimmed,
				icon,
				color,
				parentId: parent === TOP_LEVEL ? null : parent,
			});
		} catch {
			// A local write that fails is a bug, not something to explain; the message is the driver's, never copy.
			setError(t`That didn't save. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<View className="gap-4">
			<Input
				label={t`Name`}
				onChangeText={setName}
				value={name}
			/>
			<View className="gap-2">
				<Text variant="label">{t`Icon`}</Text>
				<RadioGroup
					label={t`Icon`}
					onValueChange={setIcon}
					options={ICON_KEYS.map((key) => ({
						value: key,
						label: i18n._(CATEGORY_ICON_LABELS[key]),
						content: (selected) => (
							<Icon
								as={categoryIcon(key)}
								color={selected ? colors["on-accent"] : colors.ink}
								size={20}
							/>
						),
					}))}
					value={icon}
				/>
			</View>
			<View className="gap-2">
				<Text variant="label">{t`Colour`}</Text>
				<RadioGroup
					label={t`Colour`}
					onValueChange={setColor}
					options={COLOR_KEYS.map((key) => ({
						value: key,
						label: i18n._(CATEGORY_COLOR_LABELS[key]),
						content: () => (
							<View
								className="size-5 rounded-full border-2 border-border"
								style={{ backgroundColor: categoryColor(key) }}
							/>
						),
					}))}
					value={color}
				/>
			</View>
			{(choices.length > 0 || parent !== TOP_LEVEL) && (
				<View className="gap-2">
					<Text variant="label">{t`Sits under`}</Text>
					<RadioGroup
						label={t`Sits under`}
						onValueChange={setParent}
						options={[
							{ value: TOP_LEVEL, label: t`Nothing: a top-level Category` },
							...choices.map((c) => ({ value: c.id, label: c.name })),
						]}
						value={parent}
					/>
				</View>
			)}
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			<Button
				disabled={busy}
				onPress={() => void submit()}
			>
				{submitLabel}
			</Button>
		</View>
	);
};
