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

/** Which Budget a change is to: a Category's, in a household, for a Budget month. */
export type BudgetTarget = {
	householdId: string;
	categoryId: string;
	month: string;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const overridesOf = ({ categoryId, month }: BudgetTarget) =>
	and(
		eq(budgetOverrides.category_id, categoryId),
		eq(budgetOverrides.month, month),
	);
const standingOf = ({ categoryId, month }: BudgetTarget) =>
	and(eq(budgets.category_id, categoryId), eq(budgets.valid_from, month));

/**
 * Sets a Category's Budget (or Expected income) for a Budget month: from it onward, which also drops that month's
 * override so the new amount shows there; or only for it, as a Budget override. The month's existing rows are changed
 * rather than another added; there can be more than one, from devices that set it offline.
 */
export const setBudget = async (
	target: BudgetTarget,
	amount: string,
	scope: BudgetScope,
) => {
	await db.transaction(async (tx) => {
		if (scope === ONLY_THIS_MONTH) {
			const existing = await tx
				.select({ id: budgetOverrides.id })
				.from(budgetOverrides)
				.where(overridesOf(target));
			if (existing.length > 0)
				await tx
					.update(budgetOverrides)
					.set(stamped({ amount }))
					.where(overridesOf(target));
			else
				await tx.insert(budgetOverrides).values(
					stamped({
						id: newId(),
						household_id: target.householdId,
						category_id: target.categoryId,
						month: target.month,
						amount,
						created_at: nowIso(),
					}),
				);
			return;
		}
		await setStanding(tx, target, amount);
	});
};

/** Stops a Category's Budget from a Budget month on, and drops that month's override. */
export const stopBudget = async (target: BudgetTarget) => {
	await db.transaction((tx) => setStanding(tx, target, null));
};

const setStanding = async (
	tx: Transaction,
	target: BudgetTarget,
	amount: string | null,
) => {
	await tx
		.update(budgetOverrides)
		.set(stampedDelete())
		.where(overridesOf(target));
	const existing = await tx
		.select({ id: budgets.id })
		.from(budgets)
		.where(standingOf(target));
	if (existing.length > 0)
		await tx.update(budgets).set(stamped({ amount })).where(standingOf(target));
	else
		await tx.insert(budgets).values(
			stamped({
				id: newId(),
				household_id: target.householdId,
				category_id: target.categoryId,
				valid_from: target.month,
				amount,
				created_at: nowIso(),
			}),
		);
};
