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
	CONFIRM,
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
 * Occurrences due by today that nothing has been done with, oldest first, split by mode: Confirm rules' are Pending,
 * Auto-record rules' wait for a device to record them. Undefined until everything has loaded.
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
		return {
			pending: due.filter((d) => d.rule.mode === CONFIRM),
			toRecord: due.filter((d) => d.rule.mode === AUTO),
		};
	}, [rules, records, today]);
};
