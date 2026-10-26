import { LOAN_DIRECTIONS, type LoanDirection } from "@hisaab/client-schema";
import {
	isCalendarDate,
	isDecimalAmount,
	isNegative,
	isZero,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import type { Contact } from "@/features/contacts/use-contacts";
import { orNull, recordableWallets } from "@/features/entries/draft";
import { useCommonChecks, useSave } from "@/features/entries/form-checks";
import type { WalletChoice } from "@/features/entries/types";
import { todayIn } from "@/lib/dates";

import type { LoanDraft } from "./actions";
import { LOAN_DIRECTION_LABELS } from "./labels";

/** The Contact choice that adds a new one by name; Contact ids are never empty. */
const NEW_CONTACT = "";
const DEFAULT_DIRECTION: LoanDirection = "lent";

type Props = {
	contacts: readonly Contact[];
	wallets: readonly WalletChoice[];
	/** Loans move money in Base-currency Wallets until Base amounts land (#45). */
	baseCurrency: string | null;
	timeZone: string;
	/** Today, YYYY-MM-DD; injected by tests. */
	today?: string;
	onSubmit: (draft: LoanDraft, currency: string) => Promise<void>;
};

/** A new Loan (spec §3.2): Lent or Borrowed, to or from a Contact, how much, from or into which Wallet, and when it's due. */
export const LoanForm = ({
	contacts,
	wallets,
	baseCurrency,
	timeZone,
	today = todayIn(timeZone),
	onSubmit,
}: Props) => {
	const { t, i18n } = useLingui();
	const checks = useCommonChecks();
	const { busy, error, setError, save } = useSave();
	const active = contacts.filter((c) => c.archived_at === null);
	const recordable = recordableWallets(wallets, baseCurrency);
	const [direction, setDirection] = useState<LoanDirection>(DEFAULT_DIRECTION);
	const [contactId, setContactId] = useState(active[0]?.id ?? NEW_CONTACT);
	const [newName, setNewName] = useState("");
	const [walletId, setWalletId] = useState(recordable[0]?.id ?? "");
	const [amount, setAmount] = useState("");
	const [occurredOn, setOccurredOn] = useState(today);
	const [dueOn, setDueOn] = useState("");
	const [notes, setNotes] = useState("");
	const wallet = recordable.find((w) => w.id === walletId);
	const currency = wallet?.currency ?? "";

	const submit = async () => {
		const name = newName.trim();
		if (contactId === NEW_CONTACT && (name === "" || name.length > 80))
			return setError(t`Name the Contact, in 80 characters or fewer.`);
		if (!wallet) return setError(t`Pick a Wallet.`);
		const typed = amount.trim();
		const money = isDecimalAmount(typed)
			? parseMoney(typed, wallet.currency)
			: null;
		if (!money || isNegative(money) || isZero(money))
			return setError(t`Enter an amount more than zero, like 1500.`);
		const problem = checks({ occurredOn, description: "", notes, today });
		if (problem) return setError(problem);
		const due = orNull(dueOn);
		if (due !== null && !isCalendarDate(due))
			return setError(t`Enter the due date as YYYY-MM-DD, or leave it empty.`);
		await save(() =>
			onSubmit(
				{
					direction,
					contact: contactId === NEW_CONTACT ? { name } : { id: contactId },
					walletId: wallet.id,
					amount: typed,
					occurredOn: occurredOn.trim(),
					dueOn: due,
					notes: orNull(notes),
				},
				wallet.currency,
			),
		);
	};

	return (
		<View className="gap-4">
			<RadioGroup
				label={t`Which way`}
				onValueChange={setDirection}
				options={LOAN_DIRECTIONS.map((value) => ({
					value,
					label: i18n._(LOAN_DIRECTION_LABELS[value]),
				}))}
				value={direction}
			/>
			<View className="gap-2">
				<Text variant="label">
					{direction === "lent" ? t`Lent to` : t`Borrowed from`}
				</Text>
				<RadioGroup
					label={t`Contact`}
					onValueChange={setContactId}
					options={[
						...active.map((c) => ({ value: c.id, label: c.name })),
						{ value: NEW_CONTACT, label: t`Someone new` },
					]}
					value={contactId}
				/>
				{contactId === NEW_CONTACT && (
					<Input
						label={t`Their name`}
						onChangeText={setNewName}
						value={newName}
					/>
				)}
			</View>
			<View className="gap-2">
				<Text variant="label">{direction === "lent" ? t`From` : t`Into`}</Text>
				<RadioGroup
					label={direction === "lent" ? t`From Wallet` : t`Into Wallet`}
					onValueChange={setWalletId}
					options={recordable.map((w) => ({ value: w.id, label: w.name }))}
					value={walletId}
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
				hint={t`Optional, as YYYY-MM-DD.`}
				label={t`Due`}
				onChangeText={setDueOn}
				value={dueOn}
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
				{t`Save Loan`}
			</Button>
		</View>
	);
};
