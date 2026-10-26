import { entries, entryItems, stamped } from "@hisaab/client-schema";
import { parseMoney, signedAmount } from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { EntryDraft } from "./types";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

/** An Entry's Items, replaced wholesale and kept in the order they were added. */
const writeItems = async (
	tx: Transaction,
	householdId: string,
	entryId: string,
	draft: EntryDraft,
	currency: string,
) => {
	await tx.delete(entryItems).where(eq(entryItems.entry_id, entryId));
	const createdAt = nowIso();
	for (const [position, item] of draft.items.entries()) {
		await tx.insert(entryItems).values(
			stamped({
				id: newId(),
				household_id: householdId,
				entry_id: entryId,
				position,
				description: item.description,
				amount: parseMoney(item.amount, currency).toString(),
				quantity: item.quantity,
				category_id: item.categoryId,
				created_at: createdAt,
			}),
		);
	}
};

/** Recorded by the signed-in User, automatically (spec §3.3), with its Items in the same local transaction. */
export const createEntry = async (
	householdId: string,
	userId: string,
	draft: EntryDraft,
	currency: string,
) => {
	const id = newId();
	await db.transaction(async (tx) => {
		await tx.insert(entries).values(
			stamped({
				id,
				household_id: householdId,
				...columns(draft, currency),
				created_by: userId,
				created_at: nowIso(),
			}),
		);
		await writeItems(tx, householdId, id, draft, currency);
	});
	return id;
};

export const updateEntry = async (
	entryId: string,
	householdId: string,
	draft: EntryDraft,
	currency: string,
) => {
	await db.transaction(async (tx) => {
		await tx
			.update(entries)
			.set(stamped(columns(draft, currency)))
			.where(eq(entries.id, entryId));
		await writeItems(tx, householdId, entryId, draft, currency);
	});
};

/** Its Items go first, so no Item is ever queued without its Entry. */
export const deleteEntry = async (entryId: string) => {
	await db.transaction(async (tx) => {
		await tx.delete(entryItems).where(eq(entryItems.entry_id, entryId));
		await tx.delete(entries).where(eq(entries.id, entryId));
	});
};
