import { isTimeZone } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";

import { Input } from "@/components/ui/input";
import { toCurrencyCode } from "@/lib/currency";

/** A household's name fits in 100 characters (the `households.name` check). */
export const HOUSEHOLD_NAME_MAX = 100;

/** A household's Base currency and timezone, as typed: a currency code and an IANA timezone, or what's wrong. */
export const useHouseholdChecks = () => {
	const { t } = useLingui();
	return (
		currency: string,
		timeZone: string,
	): { baseCurrency: string; timeZone: string } | { error: string } => {
		const baseCurrency = toCurrencyCode(currency);
		if (baseCurrency === null)
			return { error: t`Enter a three-letter currency code, like PKR or USD.` };
		const zone = timeZone.trim();
		if (!isTimeZone(zone))
			return { error: t`Enter a timezone like Asia/Karachi.` };
		return { baseCurrency, timeZone: zone };
	};
};

type Props = {
	currency: string;
	onCurrencyChange: (currency: string) => void;
	/** The Base currency is fixed once the household has an Entry (ADR-0005). */
	currencyLocked?: boolean;
	timeZone: string;
	onTimeZoneChange: (timeZone: string) => void;
};

/** The Base currency and timezone fields a new household and its settings share. */
export const CurrencyAndTimeZoneFields = ({
	currency,
	onCurrencyChange,
	currencyLocked = false,
	timeZone,
	onTimeZoneChange,
}: Props) => {
	const { t } = useLingui();
	return (
		<>
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
				onChangeText={onCurrencyChange}
				value={currency}
			/>
			<Input
				autoCapitalize="none"
				hint={t`Entry dates are in it.`}
				label={t`Timezone`}
				onChangeText={onTimeZoneChange}
				value={timeZone}
			/>
		</>
	);
};
