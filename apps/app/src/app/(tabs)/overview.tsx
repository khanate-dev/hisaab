import { budgetMonthRange, myOverview, reportPeriod } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { useRates } from "@/features/entries/use-rates";
import { setDisplayCurrency } from "@/features/overview/actions";
import { MyOverview } from "@/features/overview/my-overview";
import {
	useDisplayCurrency,
	useMyHouseholds,
} from "@/features/overview/use-overview";
import {
	DEFAULT_SETTINGS,
	ReportControls,
	type ReportSettings,
} from "@/features/reports/report-controls";
import { Screen } from "@/features/shell/screen";
import { deviceTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

/** The 1st of a calendar month, to name it. */
const monthStart = (month: string) => budgetMonthRange(month, 1).first;

/**
 * My overview (spec §3.5, #53): the User's own net worth and income vs expense across every household, in the display
 * currency they pick, over calendar months. Reached from the switcher's "All households" row and the Reports hub.
 */
export default function Overview() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const mine = useMyHouseholds(userId);
	const picked = useDisplayCurrency(userId);
	const rates = useRates();
	const [settings, setSettings] = useState<ReportSettings>(DEFAULT_SETTINGS);
	const today = todayIn(deviceTimeZone());

	// What it can be shown in: any currency the User's Wallets are in.
	const choices = useMemo(
		() => [
			...new Set((mine ?? []).flatMap((h) => h.wallets.map((w) => w.currency))),
		],
		[mine],
	);
	// Until they pick one: their Personal household's Base currency, else any household's.
	// Not until the pick is read, so another currency doesn't flash first.
	const currency =
		picked === undefined
			? undefined
			: (picked ??
				mine?.find((h) => h.isPersonal && h.baseCurrency)?.baseCurrency ??
				mine?.find((h) => h.baseCurrency)?.baseCurrency ??
				choices[0]);
	const overview = useMemo(
		() =>
			mine && rates && currency
				? myOverview({
						households: mine,
						currency,
						period: reportPeriod(settings.preset, today, 1),
						rates,
						today,
					})
				: undefined,
		[mine, rates, currency, settings.preset, today],
	);

	if (mine && picked !== undefined && !currency)
		return (
			<Screen title={t`My overview`}>
				<Text
					role="status"
					variant="muted"
				>
					{t`Your overview appears once one of your households has a Wallet.`}
				</Text>
			</Screen>
		);

	return (
		<Screen title={t`My overview`}>
			<Text variant="muted">
				{t`Every household you belong to, together. Only you see this.`}
			</Text>
			{currency && choices.length > 1 && (
				<RadioGroup
					label={t`Shown in`}
					onValueChange={(code) => void setDisplayCurrency(userId, code)}
					options={[...new Set([currency, ...choices])].map((code) => ({
						value: code,
						label: code,
					}))}
					value={currency}
				/>
			)}
			<ReportControls
				members={[]}
				months={t`In calendar months.`}
				onChange={setSettings}
				settings={settings}
			/>
			{overview && (
				<MyOverview
					comparison={settings.comparison}
					monthStart={monthStart}
					overview={overview}
				/>
			)}
		</Screen>
	);
}
