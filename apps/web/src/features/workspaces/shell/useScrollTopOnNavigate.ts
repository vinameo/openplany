import { useEffect, type RefObject } from "react";
import { useLocation } from "react-router";

/**
 * Resets the scroll position of the given container to the top on route/pathname change.
 * Satisfies WEB-15 and AC-21.
 */
export function useScrollTopOnNavigate(ref: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();

  useEffect(() => {
    ref.current?.scrollTo?.({ top: 0 });
  }, [pathname, ref]);
}
