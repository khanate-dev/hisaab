import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";

import {
	ACTIVITY_PAGE,
	type ActivityCursor,
	activityKey,
	fetchActivityLog,
	restoreEntry,
} from "@/lib/activity-log";

/** The household's changes, newest first, a page at a time. Online only: the log lives on the server and never syncs. */
export const useActivityLog = (householdId: string | undefined) =>
	useInfiniteQuery({
		queryKey: activityKey(householdId),
		enabled: householdId !== undefined,
		initialPageParam: null as ActivityCursor | null,
		queryFn: ({ pageParam }) => fetchActivityLog(householdId ?? "", pageParam),
		getNextPageParam: (page): ActivityCursor | undefined => {
			const last = page.at(-1);
			return page.length === ACTIVITY_PAGE && last
				? { synced_at: last.synced_at, id: last.id }
				: undefined;
		},
	});

/** Puts a deleted Entry back from the log, with the Items deleted along with it; it then syncs back like any change. */
export const useRestoreEntry = (householdId: string | undefined) => {
	const client = useQueryClient();
	return useMutation({
		mutationFn: restoreEntry,
		onSuccess: () =>
			client.invalidateQueries({ queryKey: activityKey(householdId) }),
	});
};
