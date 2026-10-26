import { invites } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

export type InviteRow = typeof invites.$inferSelect;

/** The household's Invites, newest first; only its Admins have any synced. Undefined while loading. */
export const useInvites = (householdId: string | undefined) =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(invites)
					.where(eq(invites.household_id, householdId ?? ""))
					.orderBy(desc(invites.created_at)),
			),
		),
		householdId !== undefined,
	);
