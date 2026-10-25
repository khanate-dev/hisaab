import { entries, stamped } from "@hisaab/client-schema";
import { parseMoney, signedAmount } from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { EntryDraft } from "./types";

/** The columns a draft sets: the amount signed by kind, in the Wallet's currency. */
const columns = (draft: EntryDraft, currency: string) => ({
	wallet_id: draft.walletId,
	kind: draft.kind,
	amount: signedAmount(
		draft.kind,
		parseMoney(draft.amount, currency),
	).toString(),
	category_id: draft.categoryId,
	occurred_on: draft.occurredOn,
	occurred_time: draft.occurredTime,
	description: draft.description,
	notes: draft.notes,
});

/** Recorded by the signed-in User, automatically (spec §3.3). */
export const createEntry = async (
	householdId: string,
	userId: string,
	draft: EntryDraft,
	currency: string,
) => {
	const id = newId();
	await db.insert(entries).values(
		stamped({
			id,
			household_id: householdId,
			...columns(draft, currency),
			created_by: userId,
			created_at: nowIso(),
		}),
	);
	return id;
};

export const updateEntry = async (
	entryId: string,
	draft: EntryDraft,
	currency: string,
) => {
	await db
		.update(entries)
		.set(stamped(columns(draft, currency)))
		.where(eq(entries.id, entryId));
};

export const deleteEntry = async (entryId: string) => {
	await db.delete(entries).where(eq(entries.id, entryId));
};
