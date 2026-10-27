/** How far a change to a Budget reaches: every month from this one on, or only this one (a Budget override). */
export const ONWARD = "onward";
export const ONLY_THIS_MONTH = "month";
export type BudgetScope = typeof ONWARD | typeof ONLY_THIS_MONTH;
