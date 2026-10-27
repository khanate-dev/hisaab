import { occurrences, recurringRules } from "@hisaab/client-schema";
import { dueOccurrences } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";
import { useMemo } from "react";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

import {
	AUTO,
	type Due,
	type OccurrenceRow,
	type RecurringRule,
} from "./types";

/** The household's Recurring rules; undefined until the first read lands. */
export const useRecurringRules = (
	householdId: string | undefined,
): RecurringRule[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(recurringRules)
					.where(eq(recurringRules.household_id, householdId ?? "")),
			),
		),
		householdId !== undefined,
	);

const useOccurrenceRows = (
	householdId: string | undefined,
): OccurrenceRow[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(occurrences)
					.where(eq(occurrences.household_id, householdId ?? "")),
			),
		),
		householdId !== undefined,
	);

/**
 * Occurrences due by today that nothing has been done with, oldest first: Auto-record rules' from the day the rule
 * was made wait for a device to record them; the rest (Confirm rules', and anything back-dated before an Auto-record
 * rule existed) are Pending, so nothing is recorded behind anyone's back. Undefined until everything has loaded.
 */
export const useDueOccurrences = (
	householdId: string | undefined,
	today: string,
): { pending: Due[]; toRecord: Due[] } | undefined => {
	const rules = useRecurringRules(householdId);
	const records = useOccurrenceRows(householdId);
	return useMemo(() => {
		if (!rules || !records) return undefined;
		const due = dueOccurrences(rules, records, today);
		const recordable = ({ rule, dueOn }: Due) =>
			rule.mode === AUTO &&
			rule.amount !== null &&
			dueOn >= rule.created_at.slice(0, 10);
		return {
			pending: due.filter((d) => !recordable(d)),
			toRecord: due.filter(recordable),
		};
	}, [rules, records, today]);
};
