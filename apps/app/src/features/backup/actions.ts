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
	attachmentPath,
	type BackupRow,
	type BackupTable,
	backupJson,
	buildBackup,
	type FullBackup,
	isAttachmentMediaType,
	restorePlan,
} from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { downloadAttachment } from "@/lib/attachments/storage";
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
 * and every Attachment file still kept, fetched from Storage (so it needs a connection when there are any).
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
	const files = await Promise.all(
		backup.tables.attachments.flatMap((a) => {
			const type = String(a.media_type);
			if (a.purged_at !== null || !isAttachmentMediaType(type)) return [];
			return [
				downloadAttachment(attachmentPath(householdId, a.id, type)).then(
					(data) => ({
						id: a.id,
						extension: attachmentExtension(type),
						bytes: new Uint8Array(data),
					}),
				),
			];
		}),
	);
	return packBackup(backupJson(backup), files);
};

/**
 * Restores a Full backup into a new shared household, the restorer its Admin: every record under a new id, written
 * through the local database (stamped, like any write) and synced from there, then each Attachment file queued for
 * upload with its row. Answers with the new household's id.
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
		// Archived once what refers to them is in, as the server takes nothing new into an archived one.
		for (const { table, id, archived_at } of plan.archive) {
			const target = TABLES[table] as typeof wallets;
			await tx
				.update(target)
				.set(stamped({ archived_at }))
				.where(eq(target.id, id));
		}
	});
	for (const { row, file } of plan.attachments) {
		const bytes = files.get(file.from);
		if (bytes && isAttachmentMediaType(file.mediaType))
			await restoreAttachment(
				{ ...row, household_id: householdId },
				file.mediaType,
				bytes,
			);
	}
	return householdId;
};
