import {
	isDecimalAmount,
	isNegative,
	isZero,
	magnitude,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { todayIn } from "@/lib/dates";

import { orNull, recordableWallets, startingWallet } from "./draft";
import { useCommonChecks, useSave } from "./form-checks";
import type { Entry, TransferDraft, WalletChoice } from "./types";
import type { TransferTarget } from "./use-transfer-targets";

type Props = {
	/** The Transfer being edited; absent when recording one. */
	entry?: Entry;
	/** The household's Wallets, archived ones included: active ones are offered. */
	wallets: readonly WalletChoice[];
	/** Transfers move money between Base-currency Wallets until Base amounts land (#45); null before there's one. */
	baseCurrency: string | null;
	/** The Member's default Wallet in the household: where a new one starts, when it can. */
	defaultWalletId?: string | null;
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	/**
	 * The User's other households it can go to instead, as a cross-household transfer (ADR-0003): their Wallets in
	 * the From Wallet's currency are offered, grouped by household.
	 */
	otherHouseholds?: readonly TransferTarget[];
	/** Whether it can go to another of this household's Wallets: not when editing a cross-household transfer. */
	withinHousehold?: boolean;
	/** The To Wallet when editing a cross-household transfer: its other half's, in the other household. */
	initialToWalletId?: string;
	submitLabel: string;
	onSubmit: (
		draft: TransferDraft,
		currencies: { from: string; to: string },
		/** The other household it goes to, or null when it stays in this one. */
		toHouseholdId: string | null,
	) => Promise<void>;
};

/**
 * A Transfer (spec §4.3): From, To and how much, arriving with what left. "To" is grouped by household: a Wallet in
 * another household makes it a cross-household transfer. Transfers between currencies, with what was Received, join
 * with #45 and #46.
 */
export const TransferForm = ({
	entry,
	wallets,
	baseCurrency,
	defaultWalletId,
	otherHouseholds = [],
	withinHousehold = true,
	initialToWalletId,
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
	const recordable = recordableWallets(wallets, baseCurrency);
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
	const [description, setDescription] = useState(entry?.description ?? "");
	const [notes, setNotes] = useState(entry?.notes ?? "");

	// An edited Transfer keeps showing its own Wallets, even ones archived since.
	const choices = (keep: WalletChoice | undefined) => [
		...recordable,
		...(keep && !recordable.includes(keep) ? [keep] : []),
	];

	const chooseFrom = (id: string) => {
		setFromId(id);
		if (id === toId) setToId(firstTo(id) ?? "");
	};

	const submit = async () => {
		const typed = amount.trim();
		if (!from || !to)
			return setError(t`Pick the Wallet it leaves and the one it goes to.`);
		if (from.id === to.id)
			return setError(t`A Transfer goes to another Wallet.`);
		if (toHousehold && to.currency !== from.currency)
			return setError(
				t`Between households, a Transfer stays in one currency for now.`,
			);
		const money = isDecimalAmount(typed)
			? parseMoney(typed, from.currency)
			: null;
		if (!money || isNegative(money) || isZero(money))
			return setError(t`Enter an amount more than zero, like 1500.`);
		const problem = checks({ occurredOn, description, notes, today });
		if (problem) return setError(problem);
		await save(() =>
			onSubmit(
				{
					fromWalletId: from.id,
					toWalletId: to.id,
					amount: typed,
					toAmount: typed,
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
						label: w.name,
					}))}
					value={fromId}
				/>
			</View>
			{withinHousehold && (
				<View className="gap-2">
					<Text variant="label">{t`To`}</Text>
					<RadioGroup
						label={t`To Wallet`}
						onValueChange={setToId}
						options={choices(walletOf(entry?.to_wallet_id))
							.filter((w) => w.id !== fromId)
							.map((w) => ({ value: w.id, label: w.name }))}
						value={toId}
					/>
				</View>
			)}
			{otherHouseholds.map((household) => {
				const name = household.isPersonal ? t`Personal` : household.name;
				const sameCurrency = household.wallets.filter(
					(w) => w.currency === currency,
				);
				if (sameCurrency.length === 0) return null;
				return (
					<View
						className="gap-2"
						key={household.householdId}
					>
						<Text variant="label">{t`To ${name}`}</Text>
						<RadioGroup
							label={t`To a Wallet in ${name}`}
							onValueChange={setToId}
							options={sameCurrency.map((w) => ({
								value: w.id,
								label: w.name,
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
