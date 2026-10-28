import {
	attachments,
	budgetOverrides,
	budgets,
	categories,
	contacts,
	entries,
	entryItems,
	households,
	importMappings,
	loans,
	memberships,
	occurrences,
	recurringRules,
	stamped,
	wallets,
} from "@hisaab/client-schema";
import {
	attachmentExtension,
	type BackupRow,
	type BackupTable,
	backupJson,
	buildBackup,
	type FullBackup,
	isAttachmentMediaType,
	restorePlan,
} from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { attachmentBytes } from "@/lib/attachments/attachment-bytes";
import { restoreAttachment } from "@/lib/attachments/actions";
import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import { packBackup } from "./zip";

const TABLES = {
	wallets,
	categories,
	contacts,
	loans,
	budgets,
	budget_overrides: budgetOverrides,
	recurring_rules: recurringRules,
	entries,
	entry_items: entryItems,
	occurrences,
	attachments,
	import_mappings: importMappings,
} as const satisfies Record<BackupTable, unknown>;

/**
 * Makes a household's Full backup on this device (spec §3.4: no server job): every record from the local database,
 * and the files of its Entries' Attachments, from this device where kept, else from Storage (so it needs a connection
 * for those). One at a time, to keep memory down. A file that can't be had is left out and counted, not the backup.
 */
export const makeFullBackup = async (householdId: string) => {
	const [household] = await db
		.select()
		.from(households)
		.where(eq(households.id, householdId));
	if (!household) throw new Error("No such household on this device");
	const rows = Object.fromEntries(
		await Promise.all(
			Object.entries(TABLES).map(async ([name, table]) => [
				name,
				await db
					.select()
					.from(table)
					.where(eq(table.household_id, householdId)),
			]),
		),
	) as Record<BackupTable, Record<string, unknown>[]>;
	const backup = buildBackup(household, rows, nowIso());
	// Only those of Entries still here: a deleted Entry's aren't restored.
	const entryIds = new Set(backup.tables.entries.map((e) => e.id));
	const files: { id: string; extension: string; bytes: Uint8Array }[] = [];
	let missing = 0;
	for (const a of backup.tables.attachments) {
		const type = String(a.media_type);
		if (
			a.purged_at !== null ||
			!entryIds.has(String(a.entry_id)) ||
			!isAttachmentMediaType(type)
		)
			continue;
		try {
			files.push({
				id: a.id,
				extension: attachmentExtension(type),
				bytes: await attachmentBytes({
					id: a.id,
					household_id: householdId,
					media_type: type,
				}),
			});
		} catch {
			missing += 1;
		}
	}
	return {
		bytes: packBackup(backupJson(backup), files),
		missingFiles: missing,
	};
};

/**
 * Restores a Full backup into a new shared household, the restorer its Admin: every record under a new id, written
 * through the local database (stamped, like any write) and synced from there, then each Attachment file queued for
 * upload with its row. Answers with the new household's id, and how many Attachment files didn't come back.
 */
export const restoreFullBackup = async (
	userId: string,
	backup: FullBackup,
	files: ReadonlyMap<string, Uint8Array>,
	name: string,
) => {
	const householdId = newId();
	const plan = restorePlan(backup, { householdId, userId }, newId);
	const now = nowIso();
	await db.transaction(async (tx) => {
		await tx.insert(households).values(
			stamped({
				id: householdId,
				name: name.trim(),
				personal_user_id: null,
				base_currency: backup.household.base_currency,
				timezone: backup.household.timezone,
				budget_month_start_day: backup.household.budget_month_start_day,
				created_by: userId,
				created_at: now,
				restored_at: now,
			}),
		);
		await tx.insert(memberships).values(
			stamped({
				id: newId(),
				household_id: householdId,
				user_id: userId,
				role: "admin",
				default_wallet_id: null,
				created_at: now,
			}),
		);
		for (const [table, rows] of Object.entries(plan.tables) as [
			Exclude<BackupTable, "attachments">,
			BackupRow[],
		][]) {
			// Any of the tables; each row is that table's own columns, as backed up.
			const target = TABLES[table] as typeof wallets;
			for (const row of rows)
				await tx
					.insert(target)
					.values(stamped(row as typeof wallets.$inferInsert));
		}
		// Archiving, and Auto-record back on, once what they're about is in.
		for (const { table, id, values } of plan.afterwards) {
			const target = TABLES[table] as typeof wallets;
			await tx
				.update(target)
				.set(stamped(values as Partial<typeof wallets.$inferInsert>))
				.where(eq(target.id, id));
		}
	});
	// The household is in by now: a file that won't go is counted, never a reason to restore it all again.
	let missing = 0;
	for (const { row, file } of plan.attachments) {
		const bytes = files.get(file.from);
		try {
			if (!bytes || !isAttachmentMediaType(file.mediaType))
				throw new Error("No file for this Attachment");
			await restoreAttachment(
				{ ...row, household_id: householdId },
				file.mediaType,
				bytes,
			);
		} catch {
			missing += 1;
		}
	}
	return { householdId, missingFiles: missing };
};
