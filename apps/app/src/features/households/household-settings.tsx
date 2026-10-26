import type { households } from "@hisaab/client-schema";
import { isTimeZone, parseBudgetMonthStartDay } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { useSave } from "@/features/entries/form-checks";
import type { WalletChoice } from "@/features/entries/types";
import { toCurrencyCode } from "@/lib/currency";

import type { HouseholdSettings as Settings } from "./actions";
import { HOUSEHOLD_NAME_MAX } from "./household-form";

type Household = typeof households.$inferSelect;

/** The default-Wallet choice that's no Wallet at all. */
const NO_DEFAULT = "none";

type Props = {
	household: Household;
	isPersonal: boolean;
	/** Only Admins change the settings; everyone else sees them. */
	isAdmin: boolean;
	/** The Base currency is fixed once the household has an Entry (ADR-0005). */
	currencyLocked: boolean;
	timeZoneFallback: string;
	onSave: (settings: Settings) => Promise<void>;
	/** The Wallets new Entries can go into; the User's default is one of them. Absent for Viewers. */
	defaultWallet?:
		| {
				wallets: readonly WalletChoice[];
				walletId: string | null;
				onPick: (walletId: string | null) => Promise<void>;
		  }
		| undefined;
};

/** Household settings (spec §3.1): its name, Base currency, Budget month start day and timezone, and the User's own default Wallet. */
export const HouseholdSettingsForm = ({
	household,
	isPersonal,
	isAdmin,
	currencyLocked,
	timeZoneFallback,
	onSave,
	defaultWallet,
}: Props) => {
	const { t } = useLingui();
	const { busy, error, setError, save } = useSave();
	const [saved, setSaved] = useState(false);
	const [name, setName] = useState(household.name);
	const [currency, setCurrency] = useState(household.base_currency ?? "");
	const [startDay, setStartDay] = useState(
		String(household.budget_month_start_day),
	);
	const [timeZone, setTimeZone] = useState(
		household.timezone ?? timeZoneFallback,
	);

	const shownCurrency = currency || "—";

	const submit = async () => {
		setSaved(false);
		const baseCurrency = toCurrencyCode(currency);
		if (baseCurrency === null)
			return setError(t`Enter a three-letter currency code, like PKR or USD.`);
		const budgetMonthStartDay = parseBudgetMonthStartDay(startDay);
		if (budgetMonthStartDay === null)
			return setError(t`Pick a start day from 1 to 28, so every month has it.`);
		if (!isTimeZone(timeZone.trim()))
			return setError(t`Enter a timezone like Asia/Karachi.`);
		if (!isPersonal && name.trim() === "")
			return setError(t`Give the household a name.`);
		await save(async () => {
			await onSave({
				...(!isPersonal && { name: name.trim() }),
				baseCurrency,
				budgetMonthStartDay,
				timeZone: timeZone.trim(),
			});
			setSaved(true);
		});
	};

	return (
		<View className="gap-4">
			{isAdmin ? (
				<View className="gap-4">
					{!isPersonal && (
						<Input
							label={t`Name`}
							maxLength={HOUSEHOLD_NAME_MAX}
							onChangeText={setName}
							value={name}
						/>
					)}
					<Input
						aria-disabled={currencyLocked}
						autoCapitalize="characters"
						editable={!currencyLocked}
						hint={
							currencyLocked
								? t`The Base currency is fixed once the household has an Entry.`
								: t`Budgets and reports are in it. It's fixed once the household has an Entry.`
						}
						label={t`Base currency`}
						maxLength={3}
						onChangeText={setCurrency}
						value={currency}
					/>
					<Input
						hint={t`The day each Budget month starts, from 1 to 28.`}
						inputMode="numeric"
						label={t`Budget month starts on`}
						maxLength={2}
						onChangeText={setStartDay}
						value={startDay}
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
					{saved && <Text role="status">{t`Saved.`}</Text>}
					<Button
						disabled={busy}
						onPress={() => void submit()}
					>
						{t`Save settings`}
					</Button>
				</View>
			) : (
				<Card>
					<Text variant="muted">{t`Only Admins change these.`}</Text>
					<Text>{t`Base currency: ${shownCurrency}`}</Text>
					<Text>{t`Budget month starts on day ${startDay}`}</Text>
					<Text>{t`Timezone: ${timeZone}`}</Text>
				</Card>
			)}

			{defaultWallet && (
				<View className="gap-2">
					<Text variant="title">{t`Your default Wallet`}</Text>
					<Text variant="muted">{t`New Entries start in it. It's yours alone.`}</Text>
					<RadioGroup
						label={t`Your default Wallet`}
						onValueChange={(picked) =>
							void defaultWallet.onPick(picked === NO_DEFAULT ? null : picked)
						}
						options={[
							{ value: NO_DEFAULT, label: t`None` },
							...defaultWallet.wallets.map((w) => ({
								value: w.id,
								label: w.name,
							})),
						]}
						value={defaultWallet.walletId ?? NO_DEFAULT}
					/>
				</View>
			)}
		</View>
	);
};
