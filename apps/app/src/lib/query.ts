import { QueryClient } from "@tanstack/react-query";

/**
 * The one TanStack Query client, for online-only reads such as the Activity log; local data goes through Drizzle
 * watched queries instead (CLAUDE.md).
 */
export const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
