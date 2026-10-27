import {
	type EntryFilter,
	isCalendarDate,
	isFiltering,
	NO_FILTER,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

/** One choice in a filter: its value and what it's called. */
export type Choice = { value: string; label: string };

export type FilterChoices = {
	kinds: readonly Choice[];
	wallets: readonly Choice[];
	categories: readonly Choice[];
	members: readonly Choice[];
};

type Props = {
	filter: EntryFilter;
	onChange: (filter: EntryFilter) => void;
	choices: FilterChoices;
	saved: readonly { id: string; name: string; filter: EntryFilter }[];
	onSave: (name: string) => Promise<void>;
	onDeleteSaved: (id: string) => Promise<void>;
	/** How many Entries match, of how many. */
	shown: number;
	total: number;
};

/** Chips any number of which can be on, each a checkbox. */
const Toggles = ({
	label,
	choices,
	chosen,
	onChange,
}: {
	label: string;
	choices: readonly Choice[];
	chosen: readonly string[];
	onChange: (chosen: string[]) => void;
}) =>
	choices.length === 0 ? null : (
		<View className="gap-2">
			<Text variant="label">{label}</Text>
			<View className="flex-row flex-wrap gap-2">
				{choices.map(({ value, label: name }) => {
					const on = chosen.includes(value);
					return (
						<Pressable
							accessibilityLabel={name}
							accessibilityState={{ checked: on }}
							className={`min-h-9 justify-center rounded-full border-2 border-border ps-3 pe-3 py-1 ${on ? "bg-butter" : "bg-surface"}`}
							key={value}
							onPress={() =>
								onChange(
									on ? chosen.filter((v) => v !== value) : [...chosen, value],
								)
							}
							role="checkbox"
						>
							<Text
								className={on ? "text-on-accent" : ""}
								variant="label"
							>
								{name}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);

/** A date filter's field: kept while it's being typed, applied once it's a real date (or empty). */
const DateField = ({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | null;
	onChange: (date: string | null) => void;
}) => {
	const { t } = useLingui();
	const [text, setText] = useState(value ?? "");
	return (
		<Input
			hint={t`As YYYY-MM-DD.`}
			label={label}
			onChangeText={(next) => {
				setText(next);
				const trimmed = next.trim();
				if (trimmed === "") onChange(null);
				else if (isCalendarDate(trimmed)) onChange(trimmed);
			}}
			value={text}
		/>
	);
};

/**
 * Search over the household's Entries (spec §3.4): free text and amounts (`2500`, `>2000`), the full filter set in a
 * sheet, and the User's own Saved filters.
 */
export const EntrySearch = ({
	filter,
	onChange,
	choices,
	saved,
	onSave,
	onDeleteSaved,
	shown,
	total,
}: Props) => {
	const { t } = useLingui();
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const narrowed =
		filter.kinds.length +
		filter.walletIds.length +
		filter.categoryIds.length +
		filter.memberIds.length +
		(filter.from === null ? 0 : 1) +
		(filter.to === null ? 0 : 1);
	const filtering = isFiltering(filter);

	const save = async () => {
		const trimmed = name.trim();
		if (trimmed.length < 1 || trimmed.length > 60)
			return setError(t`Name it in 1 to 60 characters.`);
		setError(null);
		await onSave(trimmed);
		setNaming(false);
		setName("");
	};

	return (
		<View className="gap-3">
			<Input
				hint={t`Words, or amounts like 2500 or >2000.`}
				label={t`Search Entries`}
				onChangeText={(query) => onChange({ ...filter, query })}
				value={filter.query}
			/>
			<View className="flex-row flex-wrap items-center gap-2">
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="secondary">
							{narrowed === 0 ? t`Filters` : t`Filters (${narrowed})`}
						</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetTitle>{t`Filters`}</SheetTitle>
						<ScrollView contentContainerClassName="gap-4">
							<Toggles
								chosen={filter.kinds}
								choices={choices.kinds}
								label={t`Kind`}
								onChange={(kinds) => onChange({ ...filter, kinds })}
							/>
							<Toggles
								chosen={filter.walletIds}
								choices={choices.wallets}
								label={t`Wallets`}
								onChange={(walletIds) => onChange({ ...filter, walletIds })}
							/>
							<Toggles
								chosen={filter.categoryIds}
								choices={choices.categories}
								label={t`Categories`}
								onChange={(categoryIds) => onChange({ ...filter, categoryIds })}
							/>
							<Toggles
								chosen={filter.memberIds}
								choices={choices.members}
								label={t`Recorded by`}
								onChange={(memberIds) => onChange({ ...filter, memberIds })}
							/>
							<DateField
								label={t`From`}
								onChange={(from) => onChange({ ...filter, from })}
								value={filter.from}
							/>
							<DateField
								label={t`To`}
								onChange={(to) => onChange({ ...filter, to })}
								value={filter.to}
							/>
						</ScrollView>
					</SheetContent>
				</Sheet>
				{filtering && (
					<Chip onPress={() => onChange(NO_FILTER)}>{t`Clear`}</Chip>
				)}
				{filtering && !naming && (
					<Chip onPress={() => setNaming(true)}>{t`Save this search`}</Chip>
				)}
			</View>
			{naming && (
				<View className="gap-2">
					<Input
						label={t`Saved filter name`}
						onChangeText={setName}
						value={name}
					/>
					{error !== null && (
						<Text
							className="text-bad"
							role="alert"
						>
							{error}
						</Text>
					)}
					<View className="flex-row flex-wrap gap-2">
						<Button onPress={() => void save()}>{t`Save filter`}</Button>
						<Button
							onPress={() => setNaming(false)}
							variant="secondary"
						>
							{t`Cancel`}
						</Button>
					</View>
				</View>
			)}
			{saved.length > 0 && (
				<View className="flex-row flex-wrap gap-2">
					{saved.map(({ id, name: savedName, filter: kept }) => (
						<View
							className="flex-row gap-1"
							key={id}
						>
							<Chip
								accessibilityLabel={t`Use the ${savedName} filter`}
								onPress={() => onChange(kept)}
							>
								{savedName}
							</Chip>
							<Chip
								accessibilityLabel={t`Delete the ${savedName} filter`}
								onPress={() => void onDeleteSaved(id)}
							>
								×
							</Chip>
						</View>
					))}
				</View>
			)}
			{filtering && (
				<Text
					role="status"
					variant="muted"
				>
					{t`${shown} of ${total} Entries`}
				</Text>
			)}
		</View>
	);
};
