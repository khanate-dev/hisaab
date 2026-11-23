import {
	entries,
	households,
	memberships,
	userSettings,
	wallets,
} from "@hisaab/client-schema";
import type { OverviewHousehold } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, asc, eq } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

/** The User's display currency for My overview (#53): null until they pick one, undefined until read. */
export const useDisplayCurrency = (userId: string) => {
	const rows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({ currency: userSettings.display_currency })
					.from(userSettings)
					.where(eq(userSettings.id, userId)),
			),
		),
	);
	return rows === undefined ? undefined : (rows[0]?.currency ?? null);
};

export type MyHousehold = OverviewHousehold & { isPersonal: boolean };

/**
 * Every household the User belongs to with its Wallets and Entries, for My overview: the device holds only theirs.
 * Undefined until the reads land.
 */
export const useMyHouseholds = (userId: string): MyHousehold[] | undefined => {
	const mine = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({
						id: households.id,
						baseCurrency: households.base_currency,
						personalUserId: households.personal_user_id,
					})
					.from(households)
					.innerJoin(
						memberships,
						and(
							eq(memberships.household_id, households.id),
							eq(memberships.user_id, userId),
						),
					),
			),
		),
	);
	const walletRows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db.select().from(wallets).orderBy(asc(wallets.created_at)),
			),
		),
	);
	const entryRows = whenLoaded(
		useQuery(toCompilableQuery(db.select().from(entries))),
	);
	return useMemo(() => {
		if (!mine || !walletRows || !entryRows) return undefined;
		return mine.map((household) => ({
			id: household.id,
			baseCurrency: household.baseCurrency,
			isPersonal: household.personalUserId === userId,
			wallets: walletRows.filter((w) => w.household_id === household.id),
			entries: entryRows.filter((e) => e.household_id === household.id),
		}));
	}, [mine, walletRows, entryRows, userId]);
};
