import type { ComponentType, SVGProps } from "react";
import { useRouteHandleMeta } from "../../../hooks/useRouteHandleMeta";

export interface WorkspacePageMeta {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface WorkspacePageHandle {
  workspacePage: WorkspacePageMeta;
}

function isWorkspacePageMeta(value: unknown): value is WorkspacePageMeta {
  if (typeof value !== "object" || value === null) return false;
  const { title, icon } = value as { title?: unknown; icon?: unknown };
  return (
    typeof title === "string" &&
    (typeof icon === "function" || (typeof icon === "object" && icon !== null))
  );
}

/** Meta of the deepest matched route that declares `workspacePage`. */
export function useWorkspacePageMeta(): WorkspacePageMeta | null {
  return useRouteHandleMeta("workspacePage", isWorkspacePageMeta);
}
