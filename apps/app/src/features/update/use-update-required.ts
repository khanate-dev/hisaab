import { appConfig, CONTRACT_VERSION } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";

import { db } from "@/lib/powersync";
import { useServerRequiresUpdate } from "@/lib/update-required";

/** True once the server's minimum contract version is above this build's, from either signal (ADR-0009). */
export const useUpdateRequired = () => {
	const serverSaid = useServerRequiresUpdate();
	const { data } = useQuery(toCompilableQuery(db.select().from(appConfig)));
	const minimum = data[0]?.min_contract_version;
	return serverSaid || (minimum !== undefined && minimum > CONTRACT_VERSION);
};
