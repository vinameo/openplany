import { QueryClient } from "@tanstack/react-query";

/**
 * Server-state cache (TanStack Query). Failures surface at once: hooks map
 * 401/403/404 to their own states and offer Retry, so automatic retries and
 * focus refetches would only delay that.
 */
export function createServerStateClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
