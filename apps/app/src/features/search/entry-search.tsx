import {
	DATE_PRESETS,
	type DatePreset,
	type EntryFilter,
	filtersOn,
	isCalendarDate,
	isFiltering,
	NO_FILTER,
	presetRange,
} from "@hisaab/domain";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ScrollView, View } from "react-native";

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
	currencies: readonly Choice[];
	contacts: readonly Choice[];
	members: readonly Choice[];
};

const PRESET_LABELS: Record<DatePreset, MessageDescriptor> = {
	this_month: msg`This Budget month`,
	last_month: msg`Last Budget month`,
	last_3_months: msg`Last 3 Budget months`,
	this_year: msg`This year`,
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
	/** For the date presets: today in the household's timezone, and its Budget month start day. */
	today: string;
	startDay: number;
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
						<Chip
							accessibilityLabel={name}
							checked={on}
							key={value}
							onPress={() =>
								onChange(
									on ? chosen.filter((v) => v !== value) : [...chosen, value],
								)
							}
						>
							{name}
						</Chip>
					);
				})}
			</View>
		</View>
	);

/** A date filter's field: applied once it's a real date; while it isn't (or is empty), it doesn't narrow. */
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
	const unfinished = text.trim() !== "" && !isCalendarDate(text.trim());
	return (
		<Input
			hint={
				unfinished
					? t`Not a date yet, so not filtering: YYYY-MM-DD.`
					: t`As YYYY-MM-DD.`
			}
			label={label}
			onChangeText={(next) => {
				setText(next);
				const trimmed = next.trim();
				onChange(isCalendarDate(trimmed) ? trimmed : null);
			}}
			value={text}
		/>
	);
};

/**
 * Search over the household's Entries (spec §3.4): free text and amounts (`2500`, `>2000`), the filter set in a
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
	today,
	startDay,
}: Props) => {
	const { t, i18n } = useLingui();
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	// Bumped when a preset sets the dates, so their fields show the new ones.
	const [presetRound, setPresetRound] = useState(0);
	const narrowed = filtersOn(filter);
	const filtering = isFiltering(filter);

	const save = async () => {
		const trimmed = name.trim();
		// Counted as Postgres counts it, by character rather than by UTF-16 unit.
		const length = [...trimmed].length;
		if (length < 1 || length > 60)
			return setError(t`Name it in 1 to 60 characters.`);
		setError(null);
		try {
			await onSave(trimmed);
			setNaming(false);
			setName("");
		} catch {
			setError(t`That didn't save. Try again.`);
		}
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
							<View className="gap-2">
								<Text variant="label">{t`Dates`}</Text>
								<View className="flex-row flex-wrap gap-2">
									{DATE_PRESETS.map((preset) => (
										<Chip
											key={preset}
											onPress={() => {
												onChange({
													...filter,
													...presetRange(preset, today, startDay),
												});
												setPresetRound((n) => n + 1);
											}}
										>
											{i18n._(PRESET_LABELS[preset])}
										</Chip>
									))}
								</View>
							</View>
							<DateField
								key={`from-${presetRound}`}
								label={t`From`}
								onChange={(from) => onChange({ ...filter, from })}
								value={filter.from}
							/>
							<DateField
								key={`to-${presetRound}`}
								label={t`To`}
								onChange={(to) => onChange({ ...filter, to })}
								value={filter.to}
							/>
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
								chosen={filter.currencies}
								choices={choices.currencies}
								label={t`Currency`}
								onChange={(currencies) => onChange({ ...filter, currencies })}
							/>
							<Toggles
								chosen={filter.contactIds}
								choices={choices.contacts}
								label={t`Loans with`}
								onChange={(contactIds) => onChange({ ...filter, contactIds })}
							/>
							<Toggles
								chosen={filter.memberIds}
								choices={choices.members}
								label={t`Recorded by`}
								onChange={(memberIds) => onChange({ ...filter, memberIds })}
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
