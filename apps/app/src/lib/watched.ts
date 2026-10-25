/**
 * A watched query's rows once its first read has landed, else undefined, so a screen doesn't show "none yet" while
 * it's still loading. `ready` is false while what the query filters on (say, the household) isn't known yet.
 */
export const whenLoaded = <T>(
	{ data, isLoading }: { data: T; isLoading: boolean },
	ready = true,
): T | undefined => (isLoading || !ready ? undefined : data);
