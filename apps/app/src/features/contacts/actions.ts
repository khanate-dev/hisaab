import { contacts, stamped } from "@hisaab/client-schema";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

export const createContact = async (householdId: string, name: string) => {
	const id = newId();
	await db.insert(contacts).values(
		stamped({
			id,
			household_id: householdId,
			name: name.trim(),
			created_at: nowIso(),
		}),
	);
	return id;
};

export const renameContact = async (contactId: string, name: string) => {
	await db
		.update(contacts)
		.set(stamped({ name: name.trim() }))
		.where(eq(contacts.id, contactId));
};

/** Archived, never deleted, once a Loan names them; they leave the list but their Loans keep them. */
export const setContactArchived = async (
	contactId: string,
	archived: boolean,
) => {
	await db
		.update(contacts)
		.set(stamped({ archived_at: archived ? nowIso() : null }))
		.where(eq(contacts.id, contactId));
};
