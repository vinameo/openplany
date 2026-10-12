import { createContext, useContext } from "react";
import type { ProjectListItem } from "@repo/contracts";

/**
 * The project of the current project screen. Pages inside a project read it
 * here instead of fetching it again (BA FC-23).
 */
export interface CurrentProjectValue {
  /** null when loading or error. */
  project: ProjectListItem | null;
  status: "loading" | "ready" | "error";
  retry: () => void;
  /** Refetches while the project stays on screen; rejects on a retryable failure. */
  reload: () => Promise<void>;
  /** Shows a project returned by a successful write (breadcrumb, title, sidebar follow). */
  applyProjectUpdate: (project: ProjectListItem) => void;
}

export const CurrentProjectContext =
  createContext<CurrentProjectValue | null>(null);

export function useCurrentProject(): CurrentProjectValue {
  const value = useContext(CurrentProjectContext);
  if (!value) {
    throw new Error(
      "useCurrentProject must be used within CurrentProjectContext",
    );
  }
  return value;
}
