import { households, memberships, wallets } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq, isNull, ne } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

import type { WalletChoice } from "./types";

const VIEWER = "viewer" as const;

/** Another household a Transfer can go to, with its Wallets there. */
export type TransferTarget = {
	householdId: string;
	name: string;
	isPersonal: boolean;
	wallets: WalletChoice[];
};

/**
 * The User's other households they record in (not as a Viewer), with the Wallets a cross-household transfer can
 * arrive in: active ones in that household's Base currency (until #45). Undefined while loading.
 */
export const useTransferTargets = (
	userId: string,
	currentHouseholdId: string | undefined,
): TransferTarget[] | undefined => {
	const rows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({
						householdId: households.id,
						name: households.name,
						personalUserId: households.personal_user_id,
						walletId: wallets.id,
						walletName: wallets.name,
						currency: wallets.currency,
					})
					.from(memberships)
					.innerJoin(households, eq(households.id, memberships.household_id))
					.innerJoin(
						wallets,
						and(
							eq(wallets.household_id, households.id),
							eq(wallets.currency, households.base_currency),
							isNull(wallets.archived_at),
						),
					)
					.where(
						and(
							eq(memberships.user_id, userId),
							ne(memberships.role, VIEWER),
							ne(households.id, currentHouseholdId ?? ""),
						),
					)
					.orderBy(households.name, wallets.created_at),
			),
		),
		currentHouseholdId !== undefined,
	);
	return useMemo(() => {
		if (rows === undefined) return undefined;
		const byHousehold = new Map<string, TransferTarget>();
		for (const row of rows) {
			const target = byHousehold.get(row.householdId) ?? {
				householdId: row.householdId,
				name: row.name,
				isPersonal: row.personalUserId === userId,
				wallets: [],
			};
			target.wallets.push({
				id: row.walletId,
				name: row.walletName,
				currency: row.currency,
				archived_at: null,
			});
			byHousehold.set(row.householdId, target);
		}
		return [...byHousehold.values()];
	}, [rows, userId]);
};
