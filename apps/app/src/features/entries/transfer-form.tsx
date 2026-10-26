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

import { orNull, recordableWallets } from "./draft";
import { useCommonChecks, useSave } from "./form-checks";
import type { Entry, TransferDraft, WalletChoice } from "./types";

type Props = {
	/** The Transfer being edited; absent when recording one. */
	entry?: Entry;
	/** The household's Wallets, archived ones included: active ones are offered. */
	wallets: readonly WalletChoice[];
	/** Transfers move money between Base-currency Wallets until Base amounts land (#45); null before there's one. */
	baseCurrency: string | null;
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	submitLabel: string;
	onSubmit: (
		draft: TransferDraft,
		currencies: { from: string; to: string },
	) => Promise<void>;
};

/**
 * A Transfer (spec §4.3): From, To and how much, arriving with what left. Transfers between currencies, with what
 * was Received, join with #45 and cross-household transfers with #43.
 */
export const TransferForm = ({
	entry,
	wallets,
	baseCurrency,
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
	const recordable = recordableWallets(wallets, baseCurrency);
	const [fromId, setFromId] = useState(
		entry?.wallet_id ?? recordable[0]?.id ?? "",
	);
	const [toId, setToId] = useState(
		entry?.to_wallet_id ?? recordable.find((w) => w.id !== fromId)?.id ?? "",
	);
	const from = walletOf(fromId);
	const to = walletOf(toId);
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
		if (id === toId) setToId(recordable.find((w) => w.id !== id)?.id ?? "");
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
