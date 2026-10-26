import type { Money } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { entryKindLabel } from "@/features/entries/labels";
import { formatDate, formatMoney } from "@/lib/format";

import { Balance } from "./balance";
import { AdjustBalance } from "./adjust-balance";
import { WALLET_TYPE_LABELS } from "./labels";
import type { HistoryRow, WalletSummary } from "./types";

type Props = {
	wallet: WalletSummary;
	/** Oldest first, as balanceHistory returns it; shown newest first. */
	history: HistoryRow[];
	/** Admins and Members manage Wallets; Viewers only look. */
	canEdit: boolean;
	onEdit: () => void;
	onArchive: () => Promise<void>;
	onUnarchive: () => Promise<void>;
	/** Records a Balance adjustment of the gap to what the Wallet really holds. */
	onAdjust: (gap: Money) => Promise<void>;
};

/** A Wallet and its balance history, derived from its Entries (ADR-0002). */
export const WalletDetail = ({
	wallet,
	history,
	canEdit,
	onEdit,
	onArchive,
	onUnarchive,
	onAdjust,
}: Props) => {
	const { t, i18n } = useLingui();
	const name = wallet.name;

	return (
		<View className="gap-4">
			<Card>
				<View className="flex-row flex-wrap items-end justify-between gap-3">
					<Text variant="muted">{i18n._(WALLET_TYPE_LABELS[wallet.type])}</Text>
					<Balance
						balance={wallet.balance}
						type={wallet.type}
					/>
				</View>
				{wallet.archived && (
					<Text
						role="note"
						variant="label"
					>
						{t`Archived: hidden from your Wallets, its Entries kept.`}
					</Text>
				)}
			</Card>

			{canEdit && (
				<View className="flex-row flex-wrap gap-3">
					{!wallet.archived && (
						<AdjustBalance
							balance={wallet.balance}
							onAdjust={onAdjust}
						/>
					)}
					<Button
						onPress={onEdit}
						variant="secondary"
					>
						{t`Edit`}
					</Button>
					{wallet.archived ? (
						<Button
							onPress={() => void onUnarchive()}
							variant="secondary"
						>
							{t`Unarchive`}
						</Button>
					) : (
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="secondary">{t`Archive`}</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogTitle>{t`Archive ${name}?`}</DialogTitle>
								<DialogDescription>
									{t`It leaves your Wallets list. Its Entries and Balance stay, and you can bring it back any time.`}
								</DialogDescription>
								<DialogFooter>
									<DialogClose asChild>
										<Button variant="secondary">{t`Cancel`}</Button>
									</DialogClose>
									<DialogClose asChild>
										<Button
											onPress={() => void onArchive()}
										>{t`Archive Wallet`}</Button>
									</DialogClose>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					)}
				</View>
			)}

			<Text variant="title">{t`Balance history`}</Text>
			{history.length === 0 ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`No Entries yet.`}
				</Text>
			) : (
				<View
					className="gap-2"
					role="list"
				>
					{history.toReversed().map((row) => (
						<View
							accessible
							className="flex-row items-center justify-between gap-3 border-b-2 border-border py-2"
							key={row.entryId}
							role="listitem"
						>
							<View className="shrink gap-1">
								<Text variant="label">{i18n._(entryKindLabel(row.kind))}</Text>
								<Text variant="muted">{formatDate(row.occurredOn)}</Text>
							</View>
							<View className="items-end gap-1">
								<Text variant="label">{formatMoney(row.amount)}</Text>
								<Balance
									balance={row.balance}
									compact
									type={wallet.type}
								/>
							</View>
						</View>
					))}
				</View>
			)}
		</View>
	);
};
