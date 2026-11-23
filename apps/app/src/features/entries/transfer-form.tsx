import {
	convertAt,
	currencyDecimals,
	isDecimalAmount,
	isNegative,
	isZero,
	magnitude,
	parseMoney,
	type RateRow,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { todayIn } from "@/lib/dates";

import { entryWallets, orNull, startingWallet } from "./draft";
import { useCommonChecks, useSave } from "./form-checks";
import type { Entry, TransferDraft, WalletChoice } from "./types";
import type { TransferTarget } from "./use-transfer-targets";

type Props = {
	/** The Transfer being edited; absent when recording one. */
	entry?: Entry;
	/** The household's Wallets, archived ones included: active ones are offered. */
	wallets: readonly WalletChoice[];
	/** The household's Base currency: Wallets in others are labelled with theirs. */
	baseCurrency: string | null;
	/** The exchange rates this device holds, to pre-fill what a Transfer between currencies brings in. */
	rates?: readonly RateRow[] | undefined;
	/** The Member's default Wallet in the household: where a new one starts, when it can. */
	defaultWalletId?: string | null;
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	/**
	 * The User's other households it can go to instead, as a cross-household transfer (ADR-0003): their active
	 * Wallets are offered, grouped by household.
	 */
	otherHouseholds?: readonly TransferTarget[];
	/** Whether it can go to another of this household's Wallets: not when editing a cross-household transfer. */
	withinHousehold?: boolean;
	/** The To Wallet when editing a cross-household transfer: its other half's, in the other household. */
	initialToWalletId?: string;
	/** What arrived, unsigned, when editing a cross-household transfer: its other half's amount. */
	initialReceived?: string | undefined;
	submitLabel: string;
	onSubmit: (
		draft: TransferDraft,
		currencies: { from: string; to: string },
		/** The other household it goes to, or null when it stays in this one. */
		toHouseholdId: string | null,
	) => Promise<void>;
};

/**
 * A Transfer (spec §4.3): From, To and how much. "To" is grouped by household: a Wallet in another household makes it
 * a cross-household transfer. Between Wallets of one currency it arrives with what left; between currencies it stores
 * both real amounts, the Received amount pre-filled at the date's rate and editable (spec §3.4).
 */
export const TransferForm = ({
	entry,
	wallets,
	baseCurrency,
	rates,
	defaultWalletId,
	otherHouseholds = [],
	withinHousehold = true,
	initialToWalletId,
	initialReceived,
	timeZone,
	today = todayIn(timeZone),
	submitLabel,
	onSubmit,
}: Props) => {
	const { t } = useLingui();
	const checks = useCommonChecks();
	const { busy, error, setError, save } = useSave();
	const walletOf = (id: string | null | undefined) =>
		wallets.find((w) => w.id === id);
	const householdOf = (id: string | null | undefined) =>
		otherHouseholds.find((h) => h.wallets.some((w) => w.id === id));
	const recordable = entryWallets(wallets);
	/** A Wallet named with its currency: "Dollars (USD)". */
	const withCurrency = (w: WalletChoice) => {
		const { name, currency: code } = w;
		return t`${name} (${code})`;
	};
	const label = (w: WalletChoice) =>
		w.currency === baseCurrency ? w.name : withCurrency(w);
	const [fromId, setFromId] = useState(
		entry?.wallet_id ?? startingWallet(recordable, defaultWalletId)?.id ?? "",
	);
	const firstTo = (exceptId: string) =>
		withinHousehold
			? recordable.find((w) => w.id !== exceptId)?.id
			: otherHouseholds[0]?.wallets[0]?.id;
	const [toId, setToId] = useState(
		initialToWalletId ?? entry?.to_wallet_id ?? firstTo(fromId) ?? "",
	);
	const from = walletOf(fromId);
	const toHousehold = householdOf(toId);
	const to = walletOf(toId) ?? toHousehold?.wallets.find((w) => w.id === toId);
	const [amount, setAmount] = useState(
		entry && from
			? magnitude(parseMoney(entry.amount, from.currency)).toString()
			: "",
	);
	const [occurredOn, setOccurredOn] = useState(entry?.occurred_on ?? today);
	// What arrived, as the User typed it; null while it follows the amount at the date's rate.
	const [received, setReceived] = useState<string | null>(
		initialReceived ??
			(entry?.to_amount != null && from && entry.to_wallet_id
				? entry.to_amount
				: null),
	);
	const between =
		from !== undefined && to !== undefined && from.currency !== to.currency;
	const expected =
		between && rates !== undefined && isDecimalAmount(amount.trim())
			? convertAt(
					parseMoney(amount.trim(), from.currency),
					to.currency,
					occurredOn.trim(),
					rates,
				)
			: null;
	const shownReceived = received ?? expected?.amount.toString() ?? "";
	const toCurrency = to?.currency ?? "";
	const [description, setDescription] = useState(entry?.description ?? "");
	const [notes, setNotes] = useState(entry?.notes ?? "");

	// An edited Transfer keeps showing its own Wallets, even ones archived since.
	const choices = (keep: WalletChoice | undefined) => [
		...recordable,
		...(keep && !recordable.includes(keep) ? [keep] : []),
	];

	// A Received amount the User typed was for these two Wallets: choosing another drops it.
	const chooseFrom = (id: string) => {
		setFromId(id);
		setReceived(null);
		if (id === toId) setToId(firstTo(id) ?? "");
	};
	const chooseTo = (id: string) => {
		setToId(id);
		setReceived(null);
	};

	const submit = async () => {
		const typed = amount.trim();
		if (!from || !to)
			return setError(t`Pick the Wallet it leaves and the one it goes to.`);
		if (from.id === to.id)
			return setError(t`A Transfer goes to another Wallet.`);
		const money = isDecimalAmount(typed)
			? parseMoney(typed, from.currency)
			: null;
		if (!money || isNegative(money) || isZero(money))
			return setError(t`Enter an amount more than zero, like 1500.`);
		const arrived = between ? shownReceived.trim() : typed;
		const arrivedMoney = isDecimalAmount(arrived)
			? parseMoney(arrived, to.currency)
			: null;
		if (!arrivedMoney || isNegative(arrivedMoney) || isZero(arrivedMoney))
			return setError(t`Enter what arrived, more than zero.`);
		const toCode = to.currency;
		const decimals = currencyDecimals(toCode);
		if (between && (arrived.split(".")[1]?.length ?? 0) > decimals)
			return setError(
				decimals === 0
					? t`${toCode} has no decimals.`
					: t`${toCode} has at most ${decimals} decimals.`,
			);
		const problem = checks({ occurredOn, description, notes, today });
		if (problem) return setError(problem);
		await save(() =>
			onSubmit(
				{
					fromWalletId: from.id,
					toWalletId: to.id,
					amount: typed,
					toAmount: arrived,
					occurredOn: occurredOn.trim(),
					description: orNull(description),
					notes: orNull(notes),
				},
				{ from: from.currency, to: to.currency },
				toHousehold?.householdId ?? null,
			),
		);
	};

	const currency = from?.currency ?? "";

	return (
		<View className="gap-4">
			<View className="gap-2">
				<Text variant="label">{t`From`}</Text>
				<RadioGroup
					label={t`From Wallet`}
					onValueChange={chooseFrom}
					options={choices(walletOf(entry?.wallet_id)).map((w) => ({
						value: w.id,
						label: label(w),
					}))}
					value={fromId}
				/>
			</View>
			{withinHousehold && (
				<View className="gap-2">
					<Text variant="label">
						{otherHouseholds.length > 0 ? t`To, in this household` : t`To`}
					</Text>
					<RadioGroup
						label={t`To Wallet`}
						onValueChange={chooseTo}
						options={choices(walletOf(entry?.to_wallet_id))
							.filter((w) => w.id !== fromId)
							.map((w) => ({ value: w.id, label: label(w) }))}
						value={toId}
					/>
				</View>
			)}
			{otherHouseholds.map((household) => {
				const name = household.isPersonal ? t`Personal` : household.name;
				const offered = household.wallets.filter((w) => w.archived_at === null);
				if (offered.length === 0) return null;
				return (
					<View
						className="gap-2"
						key={household.householdId}
					>
						<Text variant="label">{t`To ${name}`}</Text>
						<RadioGroup
							label={t`To a Wallet in ${name}`}
							onValueChange={chooseTo}
							options={offered.map((w) => ({
								value: w.id,
								label: w.currency === currency ? w.name : withCurrency(w),
							}))}
							value={toId}
						/>
					</View>
				);
			})}
			<Input
				inputMode="decimal"
				label={currency ? t`Amount (${currency})` : t`Amount`}
				onChangeText={setAmount}
				value={amount}
			/>
			{between && (
				<Input
					hint={
						received !== null
							? t`What actually arrived.`
							: expected === null
								? t`No exchange rate held yet: enter what arrived.`
								: expected.exact
									? t`At the day's market rate; change it to what actually arrived.`
									: t`At the nearest rate held; change it to what actually arrived.`
					}
					inputMode="decimal"
					label={t`Received (${toCurrency})`}
					onChangeText={setReceived}
					value={shownReceived}
				/>
			)}
			<Input
				hint={t`In the household's timezone, ${timeZone}.`}
				label={t`Date`}
				onChangeText={setOccurredOn}
				value={occurredOn}
			/>
			<Input
				hint={t`Optional.`}
				label={t`Description`}
				onChangeText={setDescription}
				value={description}
			/>
			<Input
				label={t`Notes`}
				multiline
				onChangeText={setNotes}
				value={notes}
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
				disabled={busy}
				onPress={() => void submit()}
			>
				{submitLabel}
			</Button>
		</View>
	);
};
