import { useMatches } from "react-router";

/**
 * `handle[key]` of the deepest matched route that declares a valid one, or
 * null. Route groups (workspace pages, project pages, …) describe their page
 * header through their own key and guard.
 */
export function useRouteHandleMeta<T>(
  key: string,
  isMeta: (value: unknown) => value is T,
): T | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const { handle } = matches[i];
    if (typeof handle !== "object" || handle === null || !(key in handle)) {
      continue;
    }
    const value: unknown = (handle as Record<string, unknown>)[key];
    if (isMeta(value)) return value;
  }
  return null;
}
