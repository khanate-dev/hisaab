import { formerMembers, profiles } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { useMemo } from "react";

import { db } from "@/lib/powersync";

/**
 * Everyone whose name can show against what they made, by id: the people the User shares a household with (profiles
 * sync for exactly those), and each household's Former members, as "Former member 1" (CONTEXT.md).
 */
export const usePeopleNames = (): ReadonlyMap<string, string> => {
	const { t } = useLingui();
	const people = useQuery(
		toCompilableQuery(
			db
				.select({ id: profiles.id, name: profiles.display_name })
				.from(profiles),
		),
	).data;
	const formers = useQuery(
		toCompilableQuery(
			db
				.select({ id: formerMembers.id, number: formerMembers.number })
				.from(formerMembers),
		),
	).data;
	return useMemo(
		() =>
			new Map([
				...people.map((p) => [p.id, p.name] as const),
				...formers.map(
					({ id, number }) => [id, t`Former member ${number}`] as const,
				),
			]),
		[people, formers, t],
	);
};
