import { contacts } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

export type Contact = typeof contacts.$inferSelect;

/** The household's Contacts, archived ones included, by name; undefined until the first read lands. */
export const useContacts = (
	householdId: string | undefined,
): Contact[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(contacts)
					.where(eq(contacts.household_id, householdId ?? ""))
					.orderBy(asc(contacts.name)),
			),
		),
		householdId !== undefined,
	);
