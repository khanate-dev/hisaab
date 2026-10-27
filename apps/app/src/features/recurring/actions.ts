import {
	entries,
	type OccurrenceState,
	occurrences,
	recurringRules,
	stamped,
	stampedDelete,
} from "@hisaab/client-schema";
import {
	occurrenceEntryId,
	occurrenceId,
	parseMoney,
	ruleEdit,
	signedAmount,
} from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import {
	CONFIRMED,
	type Confirmation,
	type Due,
	type RecurringRule,
	type RuleDraft,
	SKIPPED,
	SNOOZED,
} from "./types";

const columns = (draft: RuleDraft) => ({
	mode: draft.mode,
	wallet_id: draft.walletId,
	category_id: draft.categoryId,
	amount: draft.amount,
	description: draft.description,
	frequency: draft.frequency,
	interval: draft.interval,
	day_of_month: draft.dayOfMonth,
	starts_on: draft.startsOn,
	ends_on: draft.endsOn,
});

export const createRule = async (
	householdId: string,
	userId: string,
	draft: RuleDraft,
) => {
	const id = newId();
	await db.insert(recurringRules).values(
		stamped({
			id,
			household_id: householdId,
			kind: draft.kind,
			...columns(draft),
			created_by: userId,
			created_at: nowIso(),
		}),
	);
	return id;
};

const scheduleOf = (draft: RuleDraft) => ({
	frequency: draft.frequency,
	interval: draft.interval,
	day_of_month: draft.dayOfMonth,
	starts_on: draft.startsOn,
	ends_on: draft.endsOn,
});

/**
 * A rule's changes reach only Occurrences still to come (ADR-0004). One not started yet changes in place; one already
 * started ends yesterday as it was, so its past and Pending Occurrences stay as they were, and the edit carries on as a
 * new rule from its first due date from today. Returns the id the edited rule goes on under.
 */
export const updateRule = async (
	rule: RecurringRule,
	userId: string,
	draft: RuleDraft,
	today: string,
) => {
	const edit = ruleEdit(rule, scheduleOf(draft), today);
	if (!edit.split) {
		await db
			.update(recurringRules)
			.set(stamped(columns(draft)))
			.where(eq(recurringRules.id, rule.id));
		return rule.id;
	}
	const { endsOn, startsOn } = edit;
	const id = newId();
	await db.transaction(async (tx) => {
		await tx
			.update(recurringRules)
			.set(stamped({ ends_on: endsOn }))
			.where(eq(recurringRules.id, rule.id));
		if (startsOn === null) return;
		await tx.insert(recurringRules).values(
			stamped({
				id,
				household_id: rule.household_id,
				kind: rule.kind,
				...columns({ ...draft, startsOn }),
				created_by: userId,
				created_at: nowIso(),
			}),
		);
	});
	return startsOn === null ? rule.id : id;
};

/** The rule goes with what was done with its Occurrences, here and (by cascade) on the server; the Entries stay. */
export const deleteRule = async (ruleId: string) => {
	await db.transaction(async (tx) => {
		await tx
			.update(occurrences)
			.set(stampedDelete())
			.where(eq(occurrences.rule_id, ruleId));
		await tx
			.update(recurringRules)
			.set(stampedDelete())
			.where(eq(recurringRules.id, ruleId));
	});
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const localState = async (tx: Transaction, { rule, dueOn }: Due) =>
	(
		await tx
			.select({ state: occurrences.state })
			.from(occurrences)
			.where(eq(occurrences.id, occurrenceId(rule.id, dueOn)))
	)[0]?.state;

/** Writes what was done with an Occurrence, changing the row when this device already has one (it's the same id). */
const record = async (
	tx: Transaction,
	{ rule, dueOn }: Due,
	values: {
		state: OccurrenceState;
		snoozed_until: string | null;
		entry_id: string | null;
	},
) => {
	const id = occurrenceId(rule.id, dueOn);
	const [existing] = await tx
		.select({ id: occurrences.id })
		.from(occurrences)
		.where(eq(occurrences.id, id));
	if (existing)
		await tx
			.update(occurrences)
			.set(stamped(values))
			.where(eq(occurrences.id, id));
	else
		await tx.insert(occurrences).values(
			stamped({
				id,
				household_id: rule.household_id,
				rule_id: rule.id,
				due_on: dueOn,
				...values,
				created_at: nowIso(),
			}),
		);
};

/**
 * Confirms Occurrences into Entries in one local transaction, each Occurrence before its Entry. Both ids come from
 * the rule and due date, so another device confirming the same one writes the same rows and they merge (ADR-0004).
 * One this device already has confirmed (from that other device) is left as it is, and Auto-record (`onlyNew`) leaves
 * anything already done with. Amounts are in the Base currency: rules only use Wallets in it until Base amounts (#45).
 */
export const confirmOccurrences = async (
	userId: string,
	confirmations: readonly Confirmation[],
	currency: string,
	{ onlyNew = false }: { onlyNew?: boolean } = {},
) => {
	await db.transaction(async (tx) => {
		for (const { due, amount, occurredOn } of confirmations) {
			const state = await localState(tx, due);
			if (state === CONFIRMED || (onlyNew && state !== undefined)) continue;
			const { rule, dueOn } = due;
			const entryId = occurrenceEntryId(rule.id, dueOn);
			await record(tx, due, {
				state: CONFIRMED,
				snoozed_until: null,
				entry_id: entryId,
			});
			const [existing] = await tx
				.select({ id: entries.id })
				.from(entries)
				.where(eq(entries.id, entryId));
			if (existing) continue;
			await tx.insert(entries).values(
				stamped({
					id: entryId,
					household_id: rule.household_id,
					wallet_id: rule.wallet_id,
					kind: rule.kind,
					amount: signedAmount(
						rule.kind,
						parseMoney(amount, currency),
					).toString(),
					category_id: rule.category_id,
					occurred_on: occurredOn,
					description: rule.description,
					created_by: userId,
					created_at: nowIso(),
				}),
			);
		}
	});
};

/** Skipped for the whole household: it won't be Pending again. */
export const skipOccurrence = async (due: Due) => {
	await db.transaction((tx) =>
		record(tx, due, { state: SKIPPED, snoozed_until: null, entry_id: null }),
	);
};

/** Snoozed for the whole household until a date, when it's Pending again. */
export const snoozeOccurrence = async (due: Due, until: string) => {
	await db.transaction((tx) =>
		record(tx, due, { state: SNOOZED, snoozed_until: until, entry_id: null }),
	);
};
