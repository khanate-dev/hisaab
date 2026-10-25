import { WALLET_TYPES, type WalletType } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { toCurrencyCode } from "@/lib/currency";

import { WALLET_TYPE_LABELS } from "./labels";

export type WalletDraft = { name: string; type: WalletType; currency: string };

const DEFAULT_TYPE: WalletType = "cash";

type Props = {
	/** New Wallets default to the household's Base currency (spec §3.3). */
	baseCurrency: string;
	initial?: WalletDraft;
	/** A Wallet's currency is fixed once it has Entries. */
	currencyLocked?: boolean;
	submitLabel: string;
	onSubmit: (wallet: WalletDraft) => Promise<void>;
};

/** Add or edit a Wallet: its name, type (Cash, Bank, Mobile wallet, Credit card) and currency. */
export const WalletForm = ({
	baseCurrency,
	initial,
	currencyLocked = false,
	submitLabel,
	onSubmit,
}: Props) => {
	const { t, i18n } = useLingui();
	const [name, setName] = useState(initial?.name ?? "");
	const [type, setType] = useState<WalletType>(initial?.type ?? DEFAULT_TYPE);
	const [currency, setCurrency] = useState(initial?.currency ?? baseCurrency);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		const code = toCurrencyCode(currency);
		if (code === null)
			return setError(t`Enter a three-letter currency code, like PKR or USD.`);
		setError(null);
		setBusy(true);
		try {
			await onSubmit({ name: name.trim(), type, currency: code });
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
				<Text variant="label">{t`Type`}</Text>
				<RadioGroup
					label={t`Type`}
					onValueChange={setType}
					options={WALLET_TYPES.map((option) => ({
						value: option,
						label: i18n._(WALLET_TYPE_LABELS[option]),
					}))}
					value={type}
				/>
			</View>
			<Input
				aria-disabled={currencyLocked}
				autoCapitalize="characters"
				editable={!currencyLocked}
				hint={
					currencyLocked
						? t`The currency is fixed once the Wallet has Entries.`
						: undefined
				}
				label={t`Currency`}
				maxLength={3}
				onChangeText={setCurrency}
				value={currency}
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
				{submitLabel}
			</Button>
		</View>
	);
};
