import { entries, profiles } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";
import { useMemo } from "react";

import { useCategories } from "@/features/categories/use-categories";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { db } from "@/lib/powersync";

import type { Entry } from "./types";
import { toEntryViews } from "./views";

/**
 * Every Entry of the household, in no order; the domain orders them. Undefined until the first read lands, so an
 * empty list isn't shown while it's still loading.
 */
export const useEntries = (
	householdId: string | undefined,
): Entry[] | undefined => {
	const { data, isLoading } = useQuery(
		toCompilableQuery(
			db
				.select()
				.from(entries)
				.where(eq(entries.household_id, householdId ?? "")),
		),
	);
	return isLoading || householdId === undefined ? undefined : data;
};

/** A User's display name, for "Recorded by"; undefined until their profile has synced. */
export const useDisplayName = (userId: string | undefined) =>
	useQuery(
		toCompilableQuery(
			db
				.select({ name: profiles.display_name })
				.from(profiles)
				.where(eq(profiles.id, userId ?? "")),
		),
	).data[0]?.name;

/** The household's Entries, newest first, joined to their Wallets and Categories; undefined while loading. */
export const useEntryViews = (householdId: string | undefined) => {
	const list = useEntries(householdId);
	const categories = useCategories(householdId);
	const wallets = useWalletRows(householdId);
	return useMemo(
		() =>
			list === undefined || categories === undefined || wallets === undefined
				? undefined
				: toEntryViews(list, categories, wallets),
		[list, categories, wallets],
	);
};
