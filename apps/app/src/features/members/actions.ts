import {
	memberships,
	type Role,
	stamped,
	stampedDelete,
} from "@hisaab/client-schema";
import { eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

/** An Admin's change of a Member's Role; the server keeps the household's last Admin. */
export const changeRole = async (membershipId: string, role: Role) => {
	await db
		.update(memberships)
		.set(stamped({ role }))
		.where(eq(memberships.id, membershipId));
};

/** Removing a Member, or leaving: their Membership goes, and with it the household from their devices. */
export const removeMembership = async (membershipId: string) => {
	await db
		.update(memberships)
		.set(stampedDelete())
		.where(eq(memberships.id, membershipId));
};
