import { entries, importMappings, stamped } from "@hisaab/client-schema";
import type { ImportMapping } from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { ImportedRow } from "./import-wizard";

/**
 * Imports confirmed rows into a Wallet as ordinary Entries, recorded by the importing Admin (so the Activity log has
 * them), and keeps the mapping for the Wallet's next statement; all in one local transaction.
 */
export const importRows = async (
	{
		householdId,
		walletId,
		userId,
	}: { householdId: string; walletId: string; userId: string },
	rows: readonly ImportedRow[],
	mapping: ImportMapping,
) => {
	await db.transaction(async (tx) => {
		for (const row of rows)
			await tx.insert(entries).values(
				stamped({
					id: newId(),
					household_id: householdId,
					wallet_id: walletId,
					kind: row.amount.startsWith("-")
						? ("expense" as const)
						: ("income" as const),
					amount: row.amount,
					category_id: row.categoryId,
					occurred_on: row.occurredOn,
					description: row.description,
					created_by: userId,
					created_at: nowIso(),
				}),
			);
		const saved = JSON.stringify(mapping);
		const [current] = await tx
			.select({ id: importMappings.id })
			.from(importMappings)
			.where(eq(importMappings.wallet_id, walletId));
		if (current)
			await tx
				.update(importMappings)
				.set(stamped({ mapping: saved }))
				.where(eq(importMappings.id, current.id));
		else
			await tx.insert(importMappings).values(
				stamped({
					id: newId(),
					household_id: householdId,
					wallet_id: walletId,
					mapping: saved,
					created_at: nowIso(),
				}),
			);
	});
};
