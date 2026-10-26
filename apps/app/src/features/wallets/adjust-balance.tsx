import {
	adjustmentTo,
	isDecimalAmount,
	isZero,
	type Money,
	parseMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

type Props = {
	/** The Wallet's Balance now, in its currency. */
	balance: Money;
	/** Records the gap as a Balance adjustment. */
	onAdjust: (gap: Money) => Promise<void>;
};

/**
 * The Balance adjustment sheet (spec §3.2): say what the Wallet really holds, and the gap to its Balance is recorded
 * as a Balance adjustment, which budgets and reports leave out.
 */
export const AdjustBalance = ({ balance, onAdjust }: Props) => {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [actual, setActual] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const { currency } = balance;
	const typed = actual.trim();
	const gap = isDecimalAmount(typed)
		? adjustmentTo(balance, parseMoney(typed, currency))
		: null;
	const now = formatMoney(balance);
	const shownGap = gap ? formatMoney(gap) : "";

	const save = async () => {
		if (!gap)
			return setError(
				t`Enter what the Wallet really holds, like 1500 or -250.`,
			);
		if (isZero(gap))
			return setError(
				t`That's already its Balance; there's nothing to adjust.`,
			);
		setError(null);
		setBusy(true);
		try {
			await onAdjust(gap);
			setActual("");
			setOpen(false);
		} catch {
			setError(t`That didn't save. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Sheet
			onOpenChange={setOpen}
			open={open}
		>
			<SheetTrigger asChild>
				<Button variant="secondary">{t`Adjust balance`}</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetTitle>{t`Adjust balance`}</SheetTitle>
				<Text variant="muted">{t`Its Balance is ${now}. What does it really hold?`}</Text>
				<Input
					inputMode="decimal"
					label={t`Actual balance (${currency})`}
					onChangeText={setActual}
					value={actual}
				/>
				{gap && !isZero(gap) && (
					<Text
						role="status"
						variant="muted"
					>
						{t`This records an adjustment of ${shownGap}. It isn't spending or income, so budgets and reports leave it out.`}
					</Text>
				)}
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
					onPress={() => void save()}
				>
					{t`Save adjustment`}
				</Button>
			</SheetContent>
		</Sheet>
	);
};
