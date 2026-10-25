import {
	entries,
	memberships,
	type Role,
	wallets,
} from "@hisaab/client-schema";
import { balanceHistory, parseMoney, walletBalances } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";

import type { WalletSummary } from "./types";
import type { HistoryRow } from "./wallet-detail";

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
				? [{ id: wallet.id, name: wallet.name, type: wallet.type, balance }]
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
		const byId = new Map(entryRows.map((entry) => [entry.id, entry]));
		const history: HistoryRow[] = steps.flatMap((step) => {
			const entry = byId.get(step.entryId);
			return entry
				? [
						{
							entryId: entry.id,
							occurredOn: entry.occurred_on,
							kind: entry.kind,
							amount: parseMoney(entry.amount, wallet.currency),
							balance: step.balance,
						},
					]
				: [];
		});
		return {
			row: wallet,
			summary: {
				id: wallet.id,
				name: wallet.name,
				type: wallet.type,
				balance: steps.at(-1)?.balance ?? parseMoney("0", wallet.currency),
				archived: wallet.archived_at !== null,
			},
			history,
			hasEntries: entryRows.length > 0,
		};
	}, [wallet, entryRows]);
};

/** The signed-in User's Role in the household, once it has synced. */
export const useMyRole = (
	householdId: string | undefined,
	userId: string,
): Role | undefined =>
	useQuery(
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
