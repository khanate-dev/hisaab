import { entries, wallets } from "@hisaab/client-schema";
import {
	balanceHistory,
	effectOn,
	walletBalances,
	zeroMoney,
} from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

import type { HistoryRow, WalletSummary } from "./types";

// Balances are derived from Entries in the domain package (ADR-0002); amounts are summed through Money, never with
// SQL SUM (ADR-0007).

/** The household's Wallets with their Balances: active ones, or the archived ones. */
export const useWallets = (
	householdId: string | undefined,
	{ archived = false } = {},
): WalletSummary[] => {
	const id = householdId ?? "";
	const walletRows = useQuery(
		toCompilableQuery(
			db
				.select()
				.from(wallets)
				.where(
					and(
						eq(wallets.household_id, id),
						archived
							? isNotNull(wallets.archived_at)
							: isNull(wallets.archived_at),
					),
				)
				.orderBy(asc(wallets.created_at)),
		),
	).data;
	const entryRows = useQuery(
		toCompilableQuery(
			db
				.select({
					wallet_id: entries.wallet_id,
					amount: entries.amount,
					to_wallet_id: entries.to_wallet_id,
					to_amount: entries.to_amount,
				})
				.from(entries)
				.where(eq(entries.household_id, id)),
		),
	).data;

	return useMemo(() => {
		const balances = walletBalances(walletRows, entryRows);
		return walletRows.flatMap((wallet) => {
			const balance = balances.get(wallet.id);
			return balance
				? [
						{
							id: wallet.id,
							name: wallet.name,
							type: wallet.type,
							balance,
							archived: wallet.archived_at !== null,
						},
					]
				: [];
		});
	}, [walletRows, entryRows]);
};

/** One Wallet, its Balance and its balance history; undefined until it has synced. */
export const useWallet = (walletId: string) => {
	const wallet = useQuery(
		toCompilableQuery(
			db.select().from(wallets).where(eq(wallets.id, walletId)),
		),
	).data[0];
	const entryRows = useQuery(
		toCompilableQuery(
			db
				.select({
					id: entries.id,
					kind: entries.kind,
					wallet_id: entries.wallet_id,
					amount: entries.amount,
					to_wallet_id: entries.to_wallet_id,
					to_amount: entries.to_amount,
					occurred_on: entries.occurred_on,
					occurred_time: entries.occurred_time,
					created_at: entries.created_at,
				})
				.from(entries)
				// A Transfer touches this Wallet whichever side it's on.
				.where(
					or(
						eq(entries.wallet_id, walletId),
						eq(entries.to_wallet_id, walletId),
					),
				),
		),
	).data;

	return useMemo(() => {
		if (!wallet) return undefined;
		// Each Entry as it touched this Wallet: a Transfer out of it, or into it.
		const touches = entryRows.map((entry) => ({
			...entry,
			amount: effectOn(entry, walletId) ?? "0",
		}));
		const steps = balanceHistory(touches, wallet.currency);
		const history: HistoryRow[] = steps.map(({ entry, amount, balance }) => ({
			entryId: entry.id,
			occurredOn: entry.occurred_on,
			kind: entry.kind,
			amount,
			balance,
		}));
		return {
			row: wallet,
			summary: {
				id: wallet.id,
				name: wallet.name,
				type: wallet.type,
				balance: steps.at(-1)?.balance ?? zeroMoney(wallet.currency),
				archived: wallet.archived_at !== null,
			},
			history,
			hasEntries: entryRows.length > 0,
		};
	}, [wallet, entryRows, walletId]);
};

/**
 * The household's Wallet rows, archived ones included: for pickers (active ones) and for naming any Entry's Wallet.
 * Undefined until the first read lands, so a form doesn't start before its Wallets are known.
 */
export const useWalletRows = (householdId: string | undefined) => {
	return whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(wallets)
					.where(eq(wallets.household_id, householdId ?? ""))
					.orderBy(asc(wallets.created_at)),
			),
		),
		householdId !== undefined,
	);
};
