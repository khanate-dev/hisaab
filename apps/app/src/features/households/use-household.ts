import { households } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

/** One household by id, once it has synced: say the one a Wallet belongs to. */
export const useHousehold = (householdId: string | undefined) => {
	const { data } = useQuery(
		toCompilableQuery(
			db
				.select()
				.from(households)
				.where(eq(households.id, householdId ?? "")),
		),
	);
	return data[0];
};
