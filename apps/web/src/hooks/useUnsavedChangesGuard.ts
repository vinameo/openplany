import { useEffect } from "react";
import { useBlocker } from "react-router";

export function useUnsavedChangesGuard(hasChanges: boolean): {
  blocked: boolean;
  proceed: () => void;
  stay: () => void;
} {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasChanges]);

  return {
    blocked: blocker.state === "blocked",
    proceed: () => {
      if (blocker.state === "blocked") {
        blocker.proceed();
      }
    },
    stay: () => {
      if (blocker.state === "blocked") {
        blocker.reset();
      }
    },
  };
}

