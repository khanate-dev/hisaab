import {
	DATE_FORMATS,
	type DateFormat,
	type ExistingEntry,
	type ImportMapping,
	type ImportRow,
	isNegative,
	likelyDuplicates,
	magnitude,
	parseCsv,
	readRows,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { Category } from "@/features/categories/types";
import { formatDate, formatMoney } from "@/lib/format";

import { categoryChoices, guessCategory, kindOf } from "./rows";

/** One row to import, as the Admin confirmed it. */
export type ImportedRow = {
	occurredOn: string;
	description: string | null;
	/** Exact decimal text, signed: money in positive, money out negative. */
	amount: string;
	categoryId: string;
};

type Props = {
	walletName: string;
	currency: string;
	categories: readonly Category[];
	/** The Wallet's Entries, for flagging likely duplicates. */
	existing: readonly ExistingEntry[];
	/** The Wallet's saved mapping, if it has one. */
	savedMapping: ImportMapping | null;
	/** Reads a CSV file the Admin picks; null when they back out. */
	onChooseFile: () => Promise<string | null>;
	onImport: (rows: ImportedRow[], mapping: ImportMapping) => Promise<void>;
	onDone: () => void;
};

const NONE = "none";
const SOURCE = "source";
const MAP = "map";
const REVIEW = "review";
const DONE = "done";
type Step = typeof SOURCE | typeof MAP | typeof REVIEW | typeof DONE;
const ISO_DATES: DateFormat = "YYYY-MM-DD";
const SINGLE = "single";
const SPLIT = "split";

const DEFAULT_MAPPING: ImportMapping = {
	hasHeader: true,
	dateColumn: 0,
	dateFormat: ISO_DATES,
	descriptionColumn: 1,
	amount: { kind: "single", column: 2, outIsPositive: false },
	categoryColumn: null,
};

/**
 * CSV import into one Wallet (spec §3.4): paste or pick a statement, map its columns (kept for the Wallet next
 * time), then assign each row a Category, with likely duplicates flagged and left out unless kept, and import.
 */
export const ImportWizard = ({
	walletName,
	currency,
	categories,
	existing,
	savedMapping,
	onChooseFile,
	onImport,
	onDone,
}: Props) => {
	const { t } = useLingui();
	const [step, setStep] = useState<Step>(SOURCE);
	const [text, setText] = useState("");
	const [mapping, setMapping] = useState<ImportMapping>(
		savedMapping ?? DEFAULT_MAPPING,
	);
	const [chosen, setChosen] = useState<Record<number, string>>({});
	const [kept, setKept] = useState<Record<number, boolean>>({});
	const [picking, setPicking] = useState<ImportRow | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [imported, setImported] = useState(0);

	const table = useMemo(() => parseCsv(text), [text]);
	const width = Math.max(0, ...table.map((r) => r.length));
	const header = mapping.hasHeader ? table[0] : undefined;
	const columns = Array.from({ length: width }, (_, i) => {
		const named = header?.[i]?.trim();
		const number = i + 1;
		return { value: String(i), label: named ? named : t`Column ${number}` };
	});
	const optional = [{ value: NONE, label: t`None` }, ...columns];
	const read = useMemo(
		() => readRows(table, mapping, currency),
		[table, mapping, currency],
	);
	const duplicates = useMemo(
		() => likelyDuplicates(read.rows, existing, currency),
		[read.rows, existing, currency],
	);
	const categoryOf = (row: ImportRow) =>
		chosen[row.line] ?? guessCategory(row, categories);
	const included = read.rows.filter(
		(row) => kept[row.line] ?? !duplicates.has(row.line),
	);
	const missing = included.filter((row) => categoryOf(row) === null).length;

	const column = (value: string) => (value === NONE ? null : Number(value));
	const set = (changes: Partial<ImportMapping>) =>
		setMapping((m) => ({ ...m, ...changes }));

	const loadFile = async () => {
		setError(null);
		try {
			const picked = await onChooseFile();
			if (picked !== null) setText(picked);
		} catch {
			setError(t`That file couldn't be read. Paste its contents instead.`);
		}
	};

	const confirm = async () => {
		const rows = included.flatMap((row) => {
			const categoryId = categoryOf(row);
			return categoryId === null
				? []
				: [
						{
							occurredOn: row.occurredOn,
							description: row.description,
							amount: row.amount.toString(),
							categoryId,
						},
					];
		});
		setBusy(true);
		setError(null);
		try {
			await onImport(rows, mapping);
			setImported(rows.length);
			setStep(DONE);
		} catch {
			setError(t`That didn't import. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	if (step === DONE) {
		return (
			<View className="gap-4">
				<Text role="status">
					{imported === 1
						? t`Imported 1 Entry into ${walletName}.`
						: t`Imported ${imported} Entries into ${walletName}.`}
				</Text>
				<Button onPress={onDone}>{t`Done`}</Button>
			</View>
		);
	}

	if (step === SOURCE) {
		return (
			<View className="gap-4">
				<Text variant="muted">
					{t`Import a statement into ${walletName} as Entries. Any bank's CSV works: you map its columns next.`}
				</Text>
				<Input
					label={t`Statement CSV`}
					multiline
					numberOfLines={8}
					onChangeText={setText}
					placeholder={t`Paste the CSV here`}
					value={text}
				/>
				<Button
					onPress={() => void loadFile()}
					variant="secondary"
				>
					{t`Choose CSV file`}
				</Button>
				{error !== null && (
					<Text
						className="text-bad"
						role="alert"
					>
						{error}
					</Text>
				)}
				<Button
					disabled={table.length === 0}
					onPress={() => setStep(MAP)}
				>
					{t`Map columns`}
				</Button>
			</View>
		);
	}

	if (step === MAP) {
		const first = read.rows[0];
		const firstAmount = first ? formatMoney(first.amount) : "";
		const firstDate = first ? formatDate(first.occurredOn) : "";
		const firstName = first?.description ?? "";
		const readCount = read.rows.length;
		const unreadable = read.problems.length;
		return (
			<View className="gap-4">
				<Chip
					checked={mapping.hasHeader}
					onPress={() => set({ hasHeader: !mapping.hasHeader })}
				>
					{t`The first row is a header`}
				</Chip>
				<RadioGroup
					label={t`Date`}
					onValueChange={(v) => set({ dateColumn: Number(v) })}
					options={columns}
					value={String(mapping.dateColumn)}
				/>
				<RadioGroup
					label={t`Date format`}
					onValueChange={(dateFormat: DateFormat) => set({ dateFormat })}
					options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
					value={mapping.dateFormat}
				/>
				<RadioGroup
					label={t`Description`}
					onValueChange={(v) => set({ descriptionColumn: column(v) })}
					options={optional}
					value={
						mapping.descriptionColumn === null
							? NONE
							: String(mapping.descriptionColumn)
					}
				/>
				<RadioGroup
					label={t`Amounts`}
					onValueChange={(kind) =>
						set({
							amount:
								kind === SINGLE
									? { kind: "single", column: 2, outIsPositive: false }
									: { kind: "split", debitColumn: 2, creditColumn: 3 },
						})
					}
					options={[
						{ value: SINGLE, label: t`One amount column` },
						{ value: SPLIT, label: t`Debit and credit columns` },
					]}
					value={mapping.amount.kind}
				/>
				{mapping.amount.kind === "single" ? (
					<>
						<RadioGroup
							label={t`Amount`}
							onValueChange={(v) =>
								set({
									amount: {
										kind: "single",
										column: Number(v),
										outIsPositive:
											mapping.amount.kind === "single" &&
											mapping.amount.outIsPositive,
									},
								})
							}
							options={columns}
							value={String(mapping.amount.column)}
						/>
						<Chip
							checked={mapping.amount.outIsPositive}
							onPress={() =>
								mapping.amount.kind === "single" &&
								set({
									amount: {
										...mapping.amount,
										outIsPositive: !mapping.amount.outIsPositive,
									},
								})
							}
						>
							{t`Money out shows as positive`}
						</Chip>
					</>
				) : (
					<>
						<RadioGroup
							label={t`Debit (money out)`}
							onValueChange={(v) =>
								mapping.amount.kind === "split" &&
								set({ amount: { ...mapping.amount, debitColumn: Number(v) } })
							}
							options={columns}
							value={String(mapping.amount.debitColumn)}
						/>
						<RadioGroup
							label={t`Credit (money in)`}
							onValueChange={(v) =>
								mapping.amount.kind === "split" &&
								set({ amount: { ...mapping.amount, creditColumn: Number(v) } })
							}
							options={columns}
							value={String(mapping.amount.creditColumn)}
						/>
					</>
				)}
				<RadioGroup
					label={t`Category (optional)`}
					onValueChange={(v) => set({ categoryColumn: column(v) })}
					options={optional}
					value={
						mapping.categoryColumn === null
							? NONE
							: String(mapping.categoryColumn)
					}
				/>
				<Card>
					<Text
						role="status"
						variant="label"
					>
						{unreadable === 0
							? t`${readCount} rows read.`
							: t`${readCount} rows read; ${unreadable} can't be, and are left out.`}
					</Text>
					{first && (
						<Text variant="muted">{t`First: ${firstDate} · ${firstName} · ${firstAmount}`}</Text>
					)}
				</Card>
				<View className="flex-row flex-wrap gap-2">
					<Button
						disabled={readCount === 0}
						onPress={() => setStep(REVIEW)}
					>
						{t`Review rows`}
					</Button>
					<Button
						onPress={() => setStep(SOURCE)}
						variant="secondary"
					>
						{t`Back`}
					</Button>
				</View>
			</View>
		);
	}

	const count = included.length;
	return (
		<View className="gap-4">
			<Text variant="muted">
				{t`Give each row a Category. Likely duplicates of Entries already here (same date and amount) are left out unless you keep them.`}
			</Text>
			{read.rows.map((row) => {
				const categoryId = categoryOf(row);
				const category = categories.find((c) => c.id === categoryId);
				const on = kept[row.line] ?? !duplicates.has(row.line);
				const date = formatDate(row.occurredOn);
				const amount = formatMoney(magnitude(row.amount));
				const name = row.description ?? t`No description`;
				const way = isNegative(row.amount) ? t`out` : t`in`;
				const categoryName = category?.name;
				return (
					<Card key={row.line}>
						<View
							accessibilityLabel={t`${date}, ${name}, ${amount} ${way}`}
							accessible
							className="gap-0.5"
						>
							<Text variant="label">{name}</Text>
							<Text variant="muted">{t`${date} · ${amount} ${way}`}</Text>
						</View>
						{duplicates.has(row.line) && (
							<Text className="text-bad">{t`Likely duplicate`}</Text>
						)}
						<View className="flex-row flex-wrap gap-2">
							<Chip
								accessibilityLabel={t`Import ${name} on ${date}`}
								checked={on}
								onPress={() => setKept((k) => ({ ...k, [row.line]: !on }))}
							>
								{t`Import`}
							</Chip>
							<Chip
								accessibilityLabel={
									categoryName === undefined
										? t`Pick a Category for ${name} on ${date}`
										: t`Category for ${name} on ${date}: ${categoryName}`
								}
								accent={on && categoryName === undefined}
								onPress={() => setPicking(row)}
							>
								{categoryName ?? t`Pick a Category`}
							</Chip>
						</View>
					</Card>
				);
			})}
			<Sheet
				onOpenChange={(open) => {
					if (!open) setPicking(null);
				}}
				open={picking !== null}
			>
				{picking !== null && (
					<SheetContent>
						<SheetTitle>{t`Category`}</SheetTitle>
						<RadioGroup
							label={t`Category`}
							onValueChange={(categoryId) => {
								setChosen((c) => ({ ...c, [picking.line]: categoryId }));
								setPicking(null);
							}}
							options={categoryChoices(
								categories,
								kindOf(picking),
								(parent, name) => t`${parent}: ${name}`,
							)}
							value={categoryOf(picking) ?? ""}
						/>
					</SheetContent>
				)}
			</Sheet>
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			{missing > 0 && (
				<Text variant="muted">
					{missing === 1
						? t`1 row still needs a Category.`
						: t`${missing} rows still need a Category.`}
				</Text>
			)}
			<View className="flex-row flex-wrap gap-2">
				<Button
					disabled={busy || count === 0 || missing > 0}
					onPress={() => void confirm()}
				>
					{count === 1 ? t`Import 1 Entry` : t`Import ${count} Entries`}
				</Button>
				<Button
					onPress={() => setStep(MAP)}
					variant="secondary"
				>
					{t`Back`}
				</Button>
			</View>
		</View>
	);
};
