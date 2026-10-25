import { isDecimalAmount } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { toCurrencyCode } from "@/lib/currency";

import type { FirstWallet } from "./types";

type Props = {
	/** From the device's locale; the User can change it. */
	defaultCurrency: string;
	onSubmit: (wallet: FirstWallet) => Promise<void>;
};

/**
 * Onboarding, step two (Core flows ticket, #19): the pre-made Cash wallet's opening balance, which becomes its first
 * Balance adjustment, and the currency, which becomes the Personal household's Base currency. Skip starts Cash at 0.
 */
export const FirstWalletForm = ({ defaultCurrency, onSubmit }: Props) => {
	const { t } = useLingui();
	const [opening, setOpening] = useState("");
	const [currency, setCurrency] = useState(defaultCurrency);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const save = async (amount: string) => {
		const code = toCurrencyCode(currency);
		if (code === null)
			return setError(t`Enter a three-letter currency code, like PKR or USD.`);
		if (!isDecimalAmount(amount))
			return setError(t`Enter an amount like 1500 or 1500.50.`);
		setError(null);
		setBusy(true);
		try {
			await onSubmit({ opening: amount, currency: code });
		} finally {
			setBusy(false);
		}
	};

	return (
		<View className="gap-4">
			<Text variant="muted">{t`How much cash do you have on you? Hisaab starts your Cash Wallet there.`}</Text>
			<Input
				inputMode="decimal"
				label={t`Cash in hand`}
				onChangeText={setOpening}
				placeholder="0"
				value={opening}
			/>
			<Input
				autoCapitalize="characters"
				hint={t`This becomes your Base currency. It locks after your first Entry.`}
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
				disabled={busy || opening.trim() === ""}
				onPress={() => void save(opening.trim())}
			>
				{t`Create Cash Wallet`}
			</Button>
			<Button
				disabled={busy}
				onPress={() => void save("0")}
				variant="secondary"
			>
				{t`Skip`}
			</Button>
		</View>
	);
};
