import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../features/auth/useAuth";
import { createServerStateClient } from "./serverStateClient";

/**
 * One cache per signed-in user: switching accounts starts empty, so data one
 * user was allowed to see is never shown to the next.
 */
export function ServerStateProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId =
    state.status === "authenticated" ? state.session.user.id : null;
  const [cache, setCache] = useState(() => ({
    userId,
    client: createServerStateClient(),
  }));
  if (cache.userId !== userId) {
    setCache({ userId, client: createServerStateClient() });
  }
  return (
    <QueryClientProvider client={cache.client}>{children}</QueryClientProvider>
  );
}
