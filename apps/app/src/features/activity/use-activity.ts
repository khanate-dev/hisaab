import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	activityKey,
	fetchActivityLog,
	restoreEntry,
} from "@/lib/activity-log";

/** The household's latest changes, newest first. Online only: the log lives on the server and never syncs. */
export const useActivityLog = (householdId: string | undefined) =>
	useQuery({
		queryKey: activityKey(householdId),
		enabled: householdId !== undefined,
		queryFn: () => fetchActivityLog(householdId ?? ""),
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
