import { entries, memberships, wallets } from "@hisaab/client-schema";
import { balanceHistory, walletBalances, zeroMoney } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";

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
				.select({ wallet_id: entries.wallet_id, amount: entries.amount })
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
					amount: entries.amount,
					occurred_on: entries.occurred_on,
					created_at: entries.created_at,
				})
				.from(entries)
				.where(eq(entries.wallet_id, walletId)),
		),
	).data;

	return useMemo(() => {
		if (!wallet) return undefined;
		const steps = balanceHistory(entryRows, wallet.currency);
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
	}, [wallet, entryRows]);
};

/**
 * Whether the signed-in User may add, edit and archive the household's Wallets: Admins and Members may, Viewers only
 * look (RLS decides; this only hides what would be refused). Undefined until their Membership has synced.
 */
export const useCanManageWallets = (
	householdId: string | undefined,
	userId: string,
): boolean | undefined => {
	const role = useQuery(
		toCompilableQuery(
			db
				.select({ role: memberships.role })
				.from(memberships)
				.where(
					and(
						eq(memberships.household_id, householdId ?? ""),
						eq(memberships.user_id, userId),
					),
				),
		),
	).data[0]?.role;
	return role === undefined ? undefined : role !== "viewer";
};
