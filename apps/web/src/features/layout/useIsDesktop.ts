import { useMediaQuery } from "@mantine/hooks";

/** Mantine `sm` breakpoint (48em = 768px), same edge as the Settings sidebar. */
export const DESKTOP_MEDIA_QUERY = "(min-width: 48em)";

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_MEDIA_QUERY, false, { getInitialValueInEffect: false });
}
