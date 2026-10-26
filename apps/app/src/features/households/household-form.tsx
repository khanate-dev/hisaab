import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useSave } from "@/features/entries/form-checks";

import type { HouseholdDraft } from "./actions";
import {
	CurrencyAndTimeZoneFields,
	HOUSEHOLD_NAME_MAX,
	useHouseholdChecks,
} from "./household-fields";

type Props = {
	/** The device's currency and timezone, as a start. */
	defaultCurrency: string;
	defaultTimeZone: string;
	onSubmit: (draft: HouseholdDraft) => Promise<void>;
};

/** A new shared household: its name, Base currency and timezone; the rest is in its settings. */
export const HouseholdForm = ({
	defaultCurrency,
	defaultTimeZone,
	onSubmit,
}: Props) => {
	const { t } = useLingui();
	const { busy, error, setError, save } = useSave();
	const check = useHouseholdChecks();
	const [name, setName] = useState("");
	const [currency, setCurrency] = useState(defaultCurrency);
	const [timeZone, setTimeZone] = useState(defaultTimeZone);

	const submit = async () => {
		const checked = check(currency, timeZone);
		if ("error" in checked) return setError(checked.error);
		await save(() => onSubmit({ name: name.trim(), ...checked }));
	};

	return (
		<View className="gap-4">
			<Input
				label={t`Name`}
				maxLength={HOUSEHOLD_NAME_MAX}
				onChangeText={setName}
				value={name}
			/>
			<CurrencyAndTimeZoneFields
				currency={currency}
				onCurrencyChange={setCurrency}
				onTimeZoneChange={setTimeZone}
				timeZone={timeZone}
			/>
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			<Button
				disabled={busy || name.trim() === ""}
				onPress={() => void submit()}
			>
				{t`Create household`}
			</Button>
		</View>
	);
};
