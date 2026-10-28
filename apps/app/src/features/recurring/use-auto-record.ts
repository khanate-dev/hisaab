import { useStatus } from "@powersync/react";
import { useEffect, useRef } from "react";

import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

import { confirmOccurrences } from "./actions";
import { occurrenceKey } from "./occurrence-key";
import { useDueOccurrences } from "./use-recurring";

/**
 * Records Auto-record rules' due Occurrences as Entries while the app is open and a User who may write is signed in,
 * so they show at once, offline too. The server's hourly job records them anyway, app closed or not (#49).
 * It waits for the device's first full sync, so it never redoes one another device already did (or whose Entry was
 * since deleted). Another device doing the same at the same time writes the same ids, and the copies merge (ADR-0004).
 */
export const useAutoRecord = () => {
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const { hasSynced } = useStatus();
	const today = todayIn(entryTimeZone(household));
	const toRecord = useDueOccurrences(household?.id, today)?.toRecord;
	const currency = household?.base_currency;
	const tried = useRef(new Set<string>());

	useEffect(() => {
		if (!toRecord || !canWrite || !hasSynced || !currency) return;
		const fresh = toRecord.filter((d) => !tried.current.has(occurrenceKey(d)));
		if (fresh.length === 0) return;
		for (const d of fresh) tried.current.add(occurrenceKey(d));
		confirmOccurrences(
			userId,
			fresh.flatMap(({ rule, dueOn }) =>
				rule.amount === null
					? []
					: [{ due: { rule, dueOn }, amount: rule.amount, occurredOn: dueOn }],
			),
			currency,
			{ onlyNew: true },
		).catch(() => {
			// Tried again on the next change; a local write failing is a bug, and nothing here can explain it.
			for (const d of fresh) tried.current.delete(occurrenceKey(d));
		});
	}, [toRecord, userId, canWrite, hasSynced, currency]);
};
