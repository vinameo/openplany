import { useCallback, useEffect, useState } from "react";

const TICK_MS = 1000;

/** Whole seconds left until a deadline; 0 when idle or finished. */
export function useCountdown(): {
  remainingSeconds: number;
  start: (seconds: number) => void;
} {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) setDeadline(null);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setDeadline(current + seconds * 1000);
  }, []);

  const remainingSeconds =
    deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  return { remainingSeconds, start };
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
