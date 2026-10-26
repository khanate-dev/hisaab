import { households } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";

import { db } from "@/lib/powersync";

/** The User's Personal household, once it has synced: where onboarding puts the First Wallet. */
export const usePersonalHousehold = (userId: string) => {
	const { data } = useQuery(
		toCompilableQuery(
			db
				.select()
				.from(households)
				.where(eq(households.personal_user_id, userId)),
		),
	);
	return data[0];
};
