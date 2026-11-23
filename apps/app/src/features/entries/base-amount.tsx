import {
	baseAmountOf,
	currencyDecimals,
	isDecimalAmount,
	isNegative,
	isZero,
	type Money,
	parseMoney,
	type RateRow,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { formatDate, formatMoney } from "@/lib/format";

/** How an Entry's Base amount stands, as the form and the Entry's page say it. */
export const useBaseAmountNote = () => {
	const { t } = useLingui();
	return {
		estimated: t`Rate estimated: corrected once that day's rate arrives.`,
		edited: t`Edited: kept as you set it.`,
		missing: t`No exchange rate yet: it's priced once one arrives.`,
		market: (date: string) => {
			const day = formatDate(date);
			return t`At ${day}'s market rate.`;
		},
	};
};

type Props = {
	/** How much, as typed, in the Wallet's currency. */
	amount: string;
	currency: string;
	baseCurrency: string;
	date: string;
	/** The exchange rates this device holds; undefined while they load. */
	rates: readonly RateRow[] | undefined;
	/** The User's own figure, unsigned, in the Base currency; null when it's priced at the rates. */
	edited: string | null;
	onEdit: (edited: string | null) => void;
};

/**
 * The Base amount of an Entry in a Wallet not in the Base currency (ADR-0005): priced at its date's rate, or estimated
 * at the nearest one held, and editable in a sheet (say, to what the bank actually charged).
 */
export const BaseAmountField = ({
	amount,
	currency,
	baseCurrency,
	date,
	rates,
	edited,
	onEdit,
}: Props) => {
	const { t } = useLingui();
	const note = useBaseAmountNote();
	const [editing, setEditing] = useState(false);
	const [typed, setTyped] = useState("");
	const [error, setError] = useState<string | null>(null);

	const priced =
		rates !== undefined &&
		isDecimalAmount(amount.trim()) &&
		currency !== baseCurrency
			? baseAmountOf({
					amount: parseMoney(amount.trim(), currency),
					baseCurrency,
					date,
					rates,
				})
			: null;
	const shown: Money | null =
		edited !== null
			? parseMoney(edited, baseCurrency)
			: (priced?.amount ?? null);

	const open = () => {
		setTyped(shown?.toString() ?? "");
		setError(null);
		setEditing(true);
	};
	const save = () => {
		const text = typed.trim();
		if (!isDecimalAmount(text))
			return setError(t`Enter an amount like 1500 or 1500.50.`);
		const money = parseMoney(text, baseCurrency);
		if (isNegative(money) || isZero(money))
			return setError(t`The amount is more than zero.`);
		const decimals = currencyDecimals(baseCurrency);
		if ((text.split(".")[1]?.length ?? 0) > decimals)
			return setError(
				decimals === 0
					? t`${baseCurrency} has no decimals.`
					: t`${baseCurrency} has at most ${decimals} decimals.`,
			);
		onEdit(money.toString());
		setEditing(false);
	};

	return (
		<View className="gap-1">
			<View className="flex-row items-center justify-between gap-3">
				<View
					accessibilityLabel={t`Base amount`}
					accessibilityValue={{ text: shown ? formatMoney(shown) : "" }}
					accessible
					className="gap-0.5"
				>
					<Text variant="muted">{t`Base amount (${baseCurrency})`}</Text>
					<Text variant="label">{shown ? formatMoney(shown) : "—"}</Text>
				</View>
				<Button
					onPress={open}
					variant="secondary"
				>
					{t`Change`}
				</Button>
			</View>
			{(edited !== null || rates !== undefined) && (
				<Text variant="muted">
					{edited !== null
						? note.edited
						: priced?.amount == null
							? note.missing
							: priced.rate === "estimated"
								? note.estimated
								: note.market(date)}
				</Text>
			)}
			<Sheet
				onOpenChange={setEditing}
				open={editing}
			>
				{editing && (
					<SheetContent>
						<SheetTitle>{t`Base amount`}</SheetTitle>
						<Input
							hint={t`What it came to in ${baseCurrency}, say what the bank charged.`}
							inputMode="decimal"
							label={t`Base amount (${baseCurrency})`}
							onChangeText={setTyped}
							value={typed}
						/>
						{error !== null && (
							<Text
								className="text-bad"
								role="alert"
							>
								{error}
							</Text>
						)}
						<Button onPress={save}>{t`Use this amount`}</Button>
						{edited !== null && (
							<Button
								onPress={() => {
									onEdit(null);
									setEditing(false);
								}}
								variant="secondary"
							>
								{t`Use the market rate`}
							</Button>
						)}
					</SheetContent>
				)}
			</Sheet>
		</View>
	);
};
