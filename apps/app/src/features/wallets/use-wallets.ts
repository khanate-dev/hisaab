import { entries, wallets } from "@hisaab/client-schema";
import { walletBalances } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";

import type { WalletSummary } from "./wallet-list";

/** The household's active Wallets with Balances derived from their Entries in the domain package (ADR-0002). */
export const useWallets = (
	householdId: string | undefined,
): WalletSummary[] => {
	const id = householdId ?? "";
	const walletRows = useQuery(
		toCompilableQuery(
			db
				.select()
				.from(wallets)
				.where(and(eq(wallets.household_id, id), isNull(wallets.archived_at)))
				.orderBy(asc(wallets.created_at)),
		),
	).data;
	// Amounts are summed in TypeScript through Money, never with SQL SUM (ADR-0007).
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
