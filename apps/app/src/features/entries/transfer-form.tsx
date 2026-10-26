import {
	isCalendarDate,
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

import type { TransferDraft } from "./actions";
import { orNull } from "./draft";
import type { Entry, WalletChoice } from "./types";

type Props = {
	/** The Transfer being edited; absent when recording one. */
	entry?: Entry;
	/** The household's Wallets, archived ones included: active ones are offered. */
	wallets: readonly WalletChoice[];
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
 * A Transfer (spec §4.3): From, To and how much. Between currencies it adds what's Received, so the two real amounts
 * are stored and the rate is implied. Cross-household transfers join with #43.
 */
export const TransferForm = ({
	entry,
	wallets,
	timeZone,
	today = todayIn(timeZone),
	submitLabel,
	onSubmit,
}: Props) => {
	const { t } = useLingui();
	const walletOf = (id: string | null | undefined) =>
		wallets.find((w) => w.id === id);
	const active = wallets.filter((w) => w.archived_at === null);
	const [fromId, setFromId] = useState(entry?.wallet_id ?? active[0]?.id ?? "");
	const [toId, setToId] = useState(
		entry?.to_wallet_id ?? active.find((w) => w.id !== fromId)?.id ?? "",
	);
	const from = walletOf(fromId);
	const to = walletOf(toId);
	const [amount, setAmount] = useState(
		entry && from
			? magnitude(parseMoney(entry.amount, from.currency)).toString()
			: "",
	);
	const [received, setReceived] = useState(entry?.to_amount ?? "");
	const [occurredOn, setOccurredOn] = useState(entry?.occurred_on ?? today);
	const [description, setDescription] = useState(entry?.description ?? "");
	const [notes, setNotes] = useState(entry?.notes ?? "");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// An edited Transfer keeps showing its Wallets even after they're archived.
	const choices = (keep: WalletChoice | undefined) => [
		...active,
		...(keep && keep.archived_at !== null ? [keep] : []),
	];
	const crossCurrency =
		from !== undefined && to !== undefined && from.currency !== to.currency;

	const chooseFrom = (id: string) => {
		setFromId(id);
		if (id === toId) setToId(active.find((w) => w.id !== id)?.id ?? "");
	};

	const positive = (text: string, currency: string) => {
		if (!isDecimalAmount(text)) return false;
		const money = parseMoney(text, currency);
		return !isNegative(money) && !isZero(money);
	};

	const submit = async () => {
		const typed = amount.trim();
		if (!from || !to)
			return setError(t`Pick the Wallet it leaves and the one it goes to.`);
		if (from.id === to.id)
			return setError(t`A Transfer goes to another Wallet.`);
		if (!positive(typed, from.currency))
			return setError(t`Enter an amount more than zero, like 1500.`);
		const arrived = crossCurrency ? received.trim() : typed;
		const toName = to.name;
		if (!positive(arrived, to.currency))
			return setError(t`Enter what arrived in ${toName}, more than zero.`);
		if (!isCalendarDate(occurredOn.trim()))
			return setError(t`Enter the date as YYYY-MM-DD, like ${today}.`);
		if (description.trim().length > 200)
			return setError(t`Keep the description to 200 characters or fewer.`);
		if (notes.trim().length > 1000)
			return setError(t`Keep the notes to 1000 characters or fewer.`);
		setError(null);
		setBusy(true);
		try {
			await onSubmit(
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
			);
		} catch {
			// A local write that fails is a bug, not something to explain; the message is the driver's, never copy.
			setError(t`That didn't save. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	const fromCurrency = from?.currency ?? "";
	const toCurrency = to?.currency ?? "";

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
				label={fromCurrency ? t`Amount (${fromCurrency})` : t`Amount`}
				onChangeText={setAmount}
				value={amount}
			/>
			{crossCurrency && (
				<Input
					hint={t`What arrived, in ${toCurrency}; the rate is what the two amounts imply.`}
					inputMode="decimal"
					label={t`Received (${toCurrency})`}
					onChangeText={setReceived}
					value={received}
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
