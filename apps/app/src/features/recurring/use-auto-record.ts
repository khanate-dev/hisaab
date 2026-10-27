import { useEffect, useRef } from "react";

import { confirmOccurrences } from "./actions";
import { occurrenceKey } from "./occurrence-key";
import type { Due } from "./types";

/**
 * Records Auto-record rules' due Occurrences as Entries on this device, once each, while a User who may write is
 * signed in. Another device doing the same writes the same ids, so the copies merge on sync (ADR-0004).
 */
export const useAutoRecord = ({
	toRecord,
	userId,
	canWrite,
	baseCurrency,
}: {
	toRecord: readonly Due[] | undefined;
	userId: string;
	canWrite: boolean;
	baseCurrency: string | null | undefined;
}) => {
	const tried = useRef(new Set<string>());
	useEffect(() => {
		if (!toRecord || !canWrite || !baseCurrency) return;
		const fresh = toRecord.filter((d) => !tried.current.has(occurrenceKey(d)));
		if (fresh.length === 0) return;
		for (const d of fresh) tried.current.add(occurrenceKey(d));
		void confirmOccurrences(
			userId,
			fresh.map((due) => ({
				due,
				amount: due.rule.amount ?? "0",
				occurredOn: due.dueOn,
			})),
			baseCurrency,
		);
	}, [toRecord, userId, canWrite, baseCurrency]);
};
