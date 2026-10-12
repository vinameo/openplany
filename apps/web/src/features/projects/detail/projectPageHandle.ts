import { useRouteHandleMeta } from "../../../hooks/useRouteHandleMeta";

export interface ProjectPageMeta {
  title: string;
}

export interface ProjectPageHandle {
  projectPage: ProjectPageMeta;
}

function isProjectPageMeta(value: unknown): value is ProjectPageMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

/** Meta of the deepest matched route that declares `projectPage`. */
export function useProjectPageMeta(): ProjectPageMeta | null {
  return useRouteHandleMeta("projectPage", isProjectPageMeta);
}
