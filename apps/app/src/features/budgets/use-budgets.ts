import { budgetOverrides, budgets } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";
import { useMemo } from "react";

import { useCategories } from "@/features/categories/use-categories";
import { useEntries, useEntryItems } from "@/features/entries/use-entries";
import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

import { type BudgetMonthView, budgetMonthView } from "./month-view";

export type Budget = typeof budgets.$inferSelect;
export type BudgetOverrideRow = typeof budgetOverrides.$inferSelect;

/** The household's standing Budgets and Budget overrides; undefined until the first reads land. */
export const useBudgetRows = (householdId: string | undefined) => {
	const id = householdId ?? "";
	const standing = whenLoaded(
		useQuery(
			toCompilableQuery(
				db.select().from(budgets).where(eq(budgets.household_id, id)),
			),
		),
		householdId !== undefined,
	);
	const overrides = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(budgetOverrides)
					.where(eq(budgetOverrides.household_id, id)),
			),
		),
		householdId !== undefined,
	);
	return useMemo(
		() => (standing && overrides ? { standing, overrides } : undefined),
		[standing, overrides],
	);
};

/**
 * A Budget month of the household, with every Budget and Expected income and how much of each is used; undefined
 * until everything it needs has loaded, or while the household has no Base currency yet.
 */
export const useBudgetMonth = (
	household:
		| {
				id: string;
				base_currency: string | null;
				budget_month_start_day: number;
		  }
		| null
		| undefined,
	month: string | undefined,
	today: string,
): BudgetMonthView | undefined => {
	const rows = useBudgetRows(household?.id);
	const categories = useCategories(household?.id);
	const entries = useEntries(household?.id);
	const items = useEntryItems(household?.id);
	const currency = household?.base_currency;
	const startDay = household?.budget_month_start_day;

	return useMemo(() => {
		if (!rows || !categories || !entries || !items) return undefined;
		if (!currency || startDay === undefined || month === undefined)
			return undefined;
		return budgetMonthView({
			month,
			today,
			startDay,
			currency,
			categories,
			standing: rows.standing,
			overrides: rows.overrides,
			entries,
			items,
		});
	}, [rows, categories, entries, items, currency, startDay, month, today]);
};
