import type { ComponentType, SVGProps } from "react";
import { useMatches } from "react-router";

export interface WorkspacePageMeta {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface WorkspacePageHandle {
  workspacePage: WorkspacePageMeta;
}

export function isWorkspacePageHandle(handle: unknown): handle is WorkspacePageHandle {
  if (typeof handle !== "object" || handle === null || !("workspacePage" in handle)) return false;
  const page: unknown = (handle as { workspacePage: unknown }).workspacePage;
  return (
    typeof page === "object" &&
    page !== null &&
    "title" in page &&
    typeof (page as { title: unknown }).title === "string" &&
    "icon" in page &&
    (typeof (page as { icon: unknown }).icon === "function" ||
      (typeof (page as { icon: unknown }).icon === "object" && (page as { icon: unknown }).icon !== null))
  );
}

/** Meta of the deepest matched route that declares `workspacePage`. */
export function useWorkspacePageMeta(): WorkspacePageMeta | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const { handle } = matches[i];
    if (isWorkspacePageHandle(handle)) return handle.workspacePage;
  }
  return null;
}
