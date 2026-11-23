import { exchangeRates } from "@hisaab/client-schema";
import type { RateRow } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

/**
 * The exchange rates this device holds (#44): the household's currencies' rates per USD, each date's, as they synced.
 * Undefined until the first read lands.
 */
export const useRates = (): RateRow[] | undefined =>
	whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select({
						on_date: exchangeRates.on_date,
						currency: exchangeRates.currency,
						per_usd: exchangeRates.per_usd,
					})
					.from(exchangeRates),
			),
		),
	);
