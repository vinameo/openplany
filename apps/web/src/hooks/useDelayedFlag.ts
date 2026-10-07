import { useEffect, useState } from "react";

/** Becomes true once `active` has stayed true for `delayMs`. */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return active && elapsed;
}
