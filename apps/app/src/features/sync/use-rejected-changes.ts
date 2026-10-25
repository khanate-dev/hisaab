import { uploadErrors } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

/** The local "couldn't sync" items, newest first, as a watched query. */
export const useRejectedChanges = () =>
	useQuery(
		toCompilableQuery(
			db.select().from(uploadErrors).orderBy(desc(uploadErrors.created_at)),
		),
	).data;

export const dismissRejectedChange = (id: string) =>
	db.delete(uploadErrors).where(eq(uploadErrors.id, id));
