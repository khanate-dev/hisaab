import type {
	OccurrenceState,
	occurrences,
	RecurringFrequency,
	RecurringMode,
	recurringRules,
} from "@hisaab/client-schema";
import type { DueOccurrence } from "@hisaab/domain";

/** A Recurring rule row as it syncs to the device. */
export type RecurringRule = typeof recurringRules.$inferSelect;
/** What the household did with an Occurrence, as it syncs. */
export type OccurrenceRow = typeof occurrences.$inferSelect;
/** An Occurrence due by today that nothing has been done with yet. */
export type Due = DueOccurrence<RecurringRule>;

/** What the rule editor sets. */
export type RuleDraft = {
	mode: RecurringMode;
	kind: RecurringRule["kind"];
	walletId: string;
	categoryId: string;
	/** Positive decimal text; null for a variable bill. */
	amount: string | null;
	description: string | null;
	frequency: RecurringFrequency;
	interval: number;
	/** Monthly rules only. */
	dayOfMonth: number | null;
	startsOn: string;
	endsOn: string | null;
};

/** One Occurrence being confirmed: how much (positive) and on what date. */
export type Confirmation = { due: Due; amount: string; occurredOn: string };

export const CONFIRM: RecurringMode = "confirm";
export const AUTO: RecurringMode = "auto";
export const MONTHLY: RecurringFrequency = "monthly";
export const WEEKLY: RecurringFrequency = "weekly";
export const YEARLY: RecurringFrequency = "yearly";
export const CONFIRMED: OccurrenceState = "confirmed";
export const SKIPPED: OccurrenceState = "skipped";
export const SNOOZED: OccurrenceState = "snoozed";
