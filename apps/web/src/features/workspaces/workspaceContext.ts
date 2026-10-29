import { createContext } from "react";
import type { WorkspaceResponse } from "@repo/contracts";

export type WorkspacesState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      workspaces: WorkspaceResponse[];
      lastWorkspaceSlug: string | null;
    };

export interface WorkspacesContextValue {
  state: WorkspacesState;
  /** Reloads the list; resolves `false` (never rejects) when it failed. */
  refresh: () => Promise<boolean>;
  add: (workspace: WorkspaceResponse) => void;
  replace: (workspace: WorkspaceResponse) => void;
}

export const WorkspacesContext = createContext<WorkspacesContextValue | null>(
  null,
);
