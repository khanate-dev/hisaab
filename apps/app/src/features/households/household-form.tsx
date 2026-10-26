import { isTimeZone } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useSave } from "@/features/entries/form-checks";
import { toCurrencyCode } from "@/lib/currency";

import type { HouseholdDraft } from "./actions";

/** A household's name fits in 100 characters (the `households.name` check). */
export const HOUSEHOLD_NAME_MAX = 100;

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
	const [name, setName] = useState("");
	const [currency, setCurrency] = useState(defaultCurrency);
	const [timeZone, setTimeZone] = useState(defaultTimeZone);

	const submit = async () => {
		const baseCurrency = toCurrencyCode(currency);
		if (baseCurrency === null)
			return setError(t`Enter a three-letter currency code, like PKR or USD.`);
		if (!isTimeZone(timeZone.trim()))
			return setError(t`Enter a timezone like Asia/Karachi.`);
		await save(() =>
			onSubmit({ name: name.trim(), baseCurrency, timeZone: timeZone.trim() }),
		);
	};

	return (
		<View className="gap-4">
			<Input
				label={t`Name`}
				maxLength={HOUSEHOLD_NAME_MAX}
				onChangeText={setName}
				value={name}
			/>
			<Input
				autoCapitalize="characters"
				hint={t`Budgets and reports are in it. It's fixed once the household has an Entry.`}
				label={t`Base currency`}
				maxLength={3}
				onChangeText={setCurrency}
				value={currency}
			/>
			<Input
				autoCapitalize="none"
				hint={t`Entry dates are in it.`}
				label={t`Timezone`}
				onChangeText={setTimeZone}
				value={timeZone}
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
