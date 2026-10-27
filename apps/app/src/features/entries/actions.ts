import {
	entries,
	entryItems,
	stamped,
	stampedDelete,
} from "@hisaab/client-schema";
import {
	householdTransferHalves,
	magnitude,
	type Money,
	negateMoney,
	parseMoney,
	signedAmount,
} from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { EntryDraft, TransferDraft } from "./types";

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

/**
 * An Entry's Items as the draft has them, kept by id: changed ones updated, new ones added, dropped ones removed, so
 * concurrent edits meet on the same rows (last writer wins per row, ADR-0007) and a kept Item isn't re-added.
 */
const writeItems = async (
	tx: Transaction,
	householdId: string,
	entryId: string,
	draft: EntryDraft,
	currency: string,
) => {
	const saved = await tx
		.select({ id: entryItems.id })
		.from(entryItems)
		.where(eq(entryItems.entry_id, entryId));
	const kept = new Set(draft.items.map((item) => item.id));
	for (const { id } of saved)
		if (!kept.has(id))
			await tx
				.update(entryItems)
				.set(stampedDelete())
				.where(eq(entryItems.id, id));
	const existing = new Set(saved.map(({ id }) => id));
	for (const [position, item] of draft.items.entries()) {
		const values = {
			position,
			description: item.description,
			amount: parseMoney(item.amount, currency).toString(),
			quantity: item.quantity,
			category_id: item.categoryId,
			rest: item.rest,
		};
		if (existing.has(item.id))
			await tx
				.update(entryItems)
				.set(stamped(values))
				.where(eq(entryItems.id, item.id));
		else
			await tx.insert(entryItems).values(
				stamped({
					id: item.id,
					household_id: householdId,
					entry_id: entryId,
					...values,
					created_at: nowIso(),
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
	householdId: string,
	entryId: string,
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

/**
 * The Entry goes first: the server removes its Items with it, in one change the Activity log can restore together.
 * Its Items then go from this device too; their deletes find nothing left on the server, which is fine. A linked
 * cross-household transfer goes with its other half (on this device for its maker, who belongs to both).
 */
export const deleteEntry = async (entryId: string) => {
	await db.transaction(async (tx) => {
		const [entry] = await tx
			.select({ linkId: entries.link_id })
			.from(entries)
			.where(eq(entries.id, entryId));
		await tx
			.update(entries)
			.set(stampedDelete())
			.where(
				entry?.linkId
					? eq(entries.link_id, entry.linkId)
					: eq(entries.id, entryId),
			);
		await tx
			.update(entryItems)
			.set(stampedDelete())
			.where(eq(entryItems.entry_id, entryId));
	});
};

const transferColumns = (
	draft: TransferDraft,
	fromCurrency: string,
	toCurrency: string,
) => ({
	kind: "transfer" as const,
	wallet_id: draft.fromWalletId,
	to_wallet_id: draft.toWalletId,
	amount: negateMoney(
		magnitude(parseMoney(draft.amount, fromCurrency)),
	).toString(),
	to_amount: magnitude(parseMoney(draft.toAmount, toCurrency)).toString(),
	category_id: null,
	occurred_on: draft.occurredOn,
	occurred_time: null,
	description: draft.description,
	notes: draft.notes,
});

/** One Entry moving money between two of the household's Wallets (CONTEXT.md, Transfer). */
export const createTransfer = async (
	householdId: string,
	userId: string,
	draft: TransferDraft,
	currencies: { from: string; to: string },
) => {
	const id = newId();
	await db.insert(entries).values(
		stamped({
			id,
			household_id: householdId,
			...transferColumns(draft, currencies.from, currencies.to),
			created_by: userId,
			created_at: nowIso(),
		}),
	);
	return id;
};

export const updateTransfer = async (
	entryId: string,
	draft: TransferDraft,
	currencies: { from: string; to: string },
) => {
	await db
		.update(entries)
		.set(stamped(transferColumns(draft, currencies.from, currencies.to)))
		.where(eq(entries.id, entryId));
};

/** Records the gap between a Wallet's Balance and what it really holds, as a Balance adjustment (spec §3.2). */
export const recordBalanceAdjustment = async (
	householdId: string,
	userId: string,
	walletId: string,
	gap: Money,
	occurredOn: string,
) => {
	await db.insert(entries).values(
		stamped({
			id: newId(),
			household_id: householdId,
			wallet_id: walletId,
			kind: "balance_adjustment" as const,
			amount: gap.toString(),
			occurred_on: occurredOn,
			created_by: userId,
			created_at: nowIso(),
		}),
	);
};

/** What a cross-household transfer's halves share: when, what for and how much (each signed for its own Wallet). */
const householdTransferColumns = (draft: TransferDraft, currency: string) => {
	const { leaves, arrives } = householdTransferHalves(
		parseMoney(draft.amount, currency),
	);
	const shared = {
		kind: "household_transfer" as const,
		category_id: null,
		to_wallet_id: null,
		to_amount: null,
		occurred_on: draft.occurredOn,
		occurred_time: null,
		description: draft.description,
		notes: draft.notes,
	};
	return {
		from: {
			...shared,
			wallet_id: draft.fromWalletId,
			amount: leaves.toString(),
		},
		to: { ...shared, wallet_id: draft.toWalletId, amount: arrives.toString() },
	};
};

/**
 * A cross-household transfer (ADR-0003): two linked, mirrored Entries made in one action, money leaving the From
 * Wallet in this household and arriving in the To Wallet in the other. Same currency on both sides until #46.
 */
export const createHouseholdTransfer = async (
	households: { from: string; to: string },
	userId: string,
	draft: TransferDraft,
	currency: string,
) => {
	const linkId = newId();
	const createdAt = nowIso();
	const { from, to } = householdTransferColumns(draft, currency);
	const id = newId();
	await db.transaction(async (tx) => {
		await tx.insert(entries).values([
			stamped({
				id,
				household_id: households.from,
				link_id: linkId,
				...from,
				created_by: userId,
				created_at: createdAt,
			}),
			stamped({
				id: newId(),
				household_id: households.to,
				link_id: linkId,
				...to,
				created_by: userId,
				created_at: createdAt,
			}),
		]);
	});
	return id;
};

/** Edits both halves together, as only their maker does; each keeps its household and which way its money goes. */
export const updateHouseholdTransfer = async (
	halves: { leaves: string; arrives: string },
	draft: TransferDraft,
	currency: string,
) => {
	const { from, to } = householdTransferColumns(draft, currency);
	await db.transaction(async (tx) => {
		await tx
			.update(entries)
			.set(stamped(from))
			.where(eq(entries.id, halves.leaves));
		await tx
			.update(entries)
			.set(stamped(to))
			.where(eq(entries.id, halves.arrives));
	});
};

/** A Transfer from the form: within the household, or to another of the User's households (ADR-0003). */
export const recordTransfer = (
	householdId: string,
	userId: string,
	draft: TransferDraft,
	currencies: { from: string; to: string },
	toHouseholdId: string | null,
) =>
	toHouseholdId === null
		? createTransfer(householdId, userId, draft, currencies)
		: createHouseholdTransfer(
				{ from: householdId, to: toHouseholdId },
				userId,
				draft,
				currencies.from,
			);
