import type {
	BudgetLine as DomainBudgetLine,
	BudgetMonthView as DomainBudgetMonthView,
} from "@hisaab/domain";

import type { Category } from "@/features/categories/types";

/** One Category's Budget (or Expected income) in a Budget month, as the app shows it. */
export type BudgetLine = DomainBudgetLine<Category>;
/** A Budget month as the Budgets tab shows it. */
export type BudgetMonthView = DomainBudgetMonthView<Category>;

export const EXPENSE: Category["kind"] = "expense";
export const INCOME: Category["kind"] = "income";
