import { REPORT_PRESETS, type ReportPreset } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { RadioGroup } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

import {
	COMPARISON_LABELS,
	COMPARISONS,
	type Comparison,
	PRESET_LABELS,
} from "./labels";

/** What a report covers and compares with, and whose Entries it counts (spec §3.5). */
export type ReportSettings = {
	preset: ReportPreset;
	comparison: Comparison;
	/** Who recorded the Entries counted; everyone's when none are picked. */
	members: readonly string[];
};

/** This Budget month, against the one before, for everyone. */
export const DEFAULT_SETTINGS: ReportSettings = {
	preset: REPORT_PRESETS[0],
	comparison: COMPARISONS[0],
	members: [],
};

/**
 * The range and comparison, picked in a sheet from a chip that says them, and the by-member filter as checkable
 * chips (only in a household with more than one member).
 */
export const ReportControls = ({
	settings,
	members,
	onChange,
	months,
}: {
	/** What the months are, said under the range; a household's Budget months unless given. */
	months?: string;
	settings: ReportSettings;
	members: readonly { userId: string; name: string }[];
	onChange: (settings: ReportSettings) => void;
}) => {
	const { t, i18n } = useLingui();
	const [picking, setPicking] = useState(false);
	const range = i18n._(PRESET_LABELS[settings.preset]);
	const comparison = i18n._(COMPARISON_LABELS[settings.comparison]);
	const toggle = (userId: string) =>
		onChange({
			...settings,
			members: settings.members.includes(userId)
				? settings.members.filter((id) => id !== userId)
				: [...settings.members, userId],
		});

	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap gap-2">
				<Chip
					accessibilityHint={t`Changes the range and what it's compared with`}
					onPress={() => setPicking(true)}
				>
					{t`${range}, ${comparison}`}
				</Chip>
			</View>
			{members.length > 1 && (
				<View
					accessibilityLabel={t`Recorded by`}
					className="flex-row flex-wrap gap-2"
				>
					{members.map((member) => (
						<Chip
							checked={settings.members.includes(member.userId)}
							key={member.userId}
							onPress={() => toggle(member.userId)}
						>
							{member.name}
						</Chip>
					))}
				</View>
			)}
			<Sheet
				onOpenChange={setPicking}
				open={picking}
			>
				{picking && (
					<SheetContent>
						<SheetTitle>{t`Range and comparison`}</SheetTitle>
						<Text variant="muted">{months ?? t`In whole Budget months.`}</Text>
						<RadioGroup
							label={t`Range`}
							onValueChange={(preset) =>
								onChange({ ...settings, preset: preset as ReportPreset })
							}
							options={REPORT_PRESETS.map((preset) => ({
								value: preset,
								label: i18n._(PRESET_LABELS[preset]),
							}))}
							value={settings.preset}
						/>
						<RadioGroup
							label={t`Compare`}
							onValueChange={(value) =>
								onChange({ ...settings, comparison: value as Comparison })
							}
							options={COMPARISONS.map((value) => ({
								value,
								label: i18n._(COMPARISON_LABELS[value]),
							}))}
							value={settings.comparison}
						/>
					</SheetContent>
				)}
			</Sheet>
		</View>
	);
};
