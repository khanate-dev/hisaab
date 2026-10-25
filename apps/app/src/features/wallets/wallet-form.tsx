import { WALLET_TYPES, type WalletType } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { isCurrencyCode } from "@/lib/currency";

import { WALLET_TYPE_LABELS } from "./wallet-list";

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
		const code = currency.trim().toUpperCase();
		if (!isCurrencyCode(code))
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
				<View
					accessibilityLabel={t`Type`}
					className="flex-row flex-wrap gap-2"
					role="radiogroup"
				>
					{WALLET_TYPES.map((option) => {
						const selected = option === type;
						return (
							<Pressable
								accessibilityLabel={i18n._(WALLET_TYPE_LABELS[option])}
								aria-checked={selected}
								className={`rounded-full border-2 border-border ps-4 pe-4 py-2 ${selected ? "bg-butter" : "bg-surface"}`}
								key={option}
								onPress={() => setType(option)}
								role="radio"
							>
								<Text variant="label">
									{i18n._(WALLET_TYPE_LABELS[option])}
								</Text>
							</Pressable>
						);
					})}
				</View>
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
