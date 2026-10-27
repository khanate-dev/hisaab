import { entries, entryItems, profiles } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";
import { useMemo } from "react";

import { useCategories } from "@/features/categories/use-categories";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

import type { Entry, EntryItem } from "./types";
import { toEntryViews } from "./views";

/**
 * Every Entry of the household, in no order; the domain orders them. Undefined until the first read lands, so an
 * empty list isn't shown while it's still loading.
 */
export const useEntries = (
	householdId: string | undefined,
): Entry[] | undefined => {
	return whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(entries)
					.where(eq(entries.household_id, householdId ?? "")),
			),
		),
		householdId !== undefined,
	);
};

/** Every Item of the household's Expenses, for the Entries list; undefined until the first read lands. */
export const useEntryItems = (
	householdId: string | undefined,
): EntryItem[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(entryItems)
					.where(eq(entryItems.household_id, householdId ?? "")),
			),
		),
		householdId !== undefined,
	);

/** One Expense's Items, for editing it; undefined until the first read lands. */
export const useItemsOf = (entryId: string): EntryItem[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db.select().from(entryItems).where(eq(entryItems.entry_id, entryId)),
			),
		),
	);

/** Whether anything is recorded in a Category (an Entry or an Item), so it's archived, never deleted; undefined while loading. */
export const useCategoryInUse = (categoryId: string): boolean | undefined => {
	const entry = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({ id: entries.id })
					.from(entries)
					.where(eq(entries.category_id, categoryId))
					.limit(1),
			),
		),
	);
	const item = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({ id: entryItems.id })
					.from(entryItems)
					.where(eq(entryItems.category_id, categoryId))
					.limit(1),
			),
		),
	);
	return entry === undefined || item === undefined
		? undefined
		: entry.length + item.length > 0;
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
	const items = useEntryItems(householdId);
	return useMemo(
		() =>
			list === undefined ||
			categories === undefined ||
			wallets === undefined ||
			items === undefined
				? undefined
				: toEntryViews(list, categories, wallets, items),
		[list, categories, wallets, items],
	);
};

/** Whether the household has any Entry, which fixes its Base currency (ADR-0005); undefined while loading. */
export const useHouseholdHasEntries = (
	householdId: string | undefined,
): boolean | undefined => {
	const rows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({ id: entries.id })
					.from(entries)
					.where(eq(entries.household_id, householdId ?? ""))
					.limit(1),
			),
		),
	);
	return rows === undefined ? undefined : rows.length > 0;
};

/** Both halves of a cross-household transfer that are on this device: both, for a User in both households. */
export const useLinkedHalves = (linkId: string | null): Entry[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(entries)
					.where(eq(entries.link_id, linkId ?? "")),
			),
		),
		linkId !== null,
	);
