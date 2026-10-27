import {
	budgetOverrides,
	budgets,
	stamped,
	stampedDelete,
} from "@hisaab/client-schema";
import { and, eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import { type BudgetScope, ONLY_THIS_MONTH } from "./scope";


type Target = { householdId: string; categoryId: string; month: string };

/**
 * Sets a Category's Budget (or Expected income) for a Budget month: from it onward, which also drops that month's
 * override so the new amount shows there; or only for it, as a Budget override. One row per Category and month, so an
 * existing one is changed rather than another added.
 */
export const setBudget = async (
	{ householdId, categoryId, month }: Target,
	amount: string,
	scope: BudgetScope,
) => {
	await db.transaction(async (tx) => {
		const [override] = await tx
			.select({ id: budgetOverrides.id })
			.from(budgetOverrides)
			.where(
				and(
					eq(budgetOverrides.category_id, categoryId),
					eq(budgetOverrides.month, month),
				),
			);
		if (scope === ONLY_THIS_MONTH) {
			if (override)
				await tx
					.update(budgetOverrides)
					.set(stamped({ amount }))
					.where(eq(budgetOverrides.id, override.id));
			else
				await tx.insert(budgetOverrides).values(
					stamped({
						id: newId(),
						household_id: householdId,
						category_id: categoryId,
						month,
						amount,
						created_at: nowIso(),
					}),
				);
			return;
		}
		if (override)
			await tx
				.update(budgetOverrides)
				.set(stampedDelete())
				.where(eq(budgetOverrides.id, override.id));
		await setStanding(tx, { householdId, categoryId, month }, amount);
	});
};

/** Stops a Category's Budget from a Budget month on, and drops that month's override. */
export const stopBudget = async (target: Target) => {
	await db.transaction(async (tx) => {
		await tx
			.update(budgetOverrides)
			.set(stampedDelete())
			.where(
				and(
					eq(budgetOverrides.category_id, target.categoryId),
					eq(budgetOverrides.month, target.month),
				),
			);
		await setStanding(tx, target, null);
	});
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const setStanding = async (
	tx: Transaction,
	{ householdId, categoryId, month }: Target,
	amount: string | null,
) => {
	const [current] = await tx
		.select({ id: budgets.id })
		.from(budgets)
		.where(
			and(eq(budgets.category_id, categoryId), eq(budgets.valid_from, month)),
		);
	if (current)
		await tx
			.update(budgets)
			.set(stamped({ amount }))
			.where(eq(budgets.id, current.id));
	else
		await tx.insert(budgets).values(
			stamped({
				id: newId(),
				household_id: householdId,
				category_id: categoryId,
				valid_from: month,
				amount,
				created_at: nowIso(),
			}),
		);
};
