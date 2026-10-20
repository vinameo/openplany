import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../features/auth/useAuth";
import { createServerStateClient } from "./serverStateClient";

/**
 * One cache per signed-in user and session epoch: switching accounts or recovering
 * from 401 with a fresh session epoch resets the cache so queries refetch.
 */
export function ServerStateProvider({ children }: { children: ReactNode }) {
  const { state, sessionEpoch } = useAuth();
  const cacheKey =
    state.status === "authenticated"
      ? `${state.session.user.id}:${sessionEpoch}`
      : null;
  const [cache, setCache] = useState(() => ({
    key: cacheKey,
    client: createServerStateClient(),
  }));
  if (cache.key !== cacheKey) {
    setCache({ key: cacheKey, client: createServerStateClient() });
  }
  return (
    <QueryClientProvider client={cache.client}>{children}</QueryClientProvider>
  );
}
