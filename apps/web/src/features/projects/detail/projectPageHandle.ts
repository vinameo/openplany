import type { MessageKey } from "@repo/contracts";
import { useRouteHandleMeta } from "../../../hooks/useRouteHandleMeta";

export interface ProjectPageMeta {
  title?: string;
  titleKey?: MessageKey;
}

export interface ProjectPageHandle {
  projectPage: ProjectPageMeta;
}

function isProjectPageMeta(value: unknown): value is ProjectPageMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    (typeof (value as { title?: unknown }).title === "string" ||
      typeof (value as { titleKey?: unknown }).titleKey === "string")
  );
}

/** Meta of the deepest matched route that declares `projectPage`. */
export function useProjectPageMeta(): ProjectPageMeta | null {
  return useRouteHandleMeta("projectPage", isProjectPageMeta);
}
