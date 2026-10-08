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
  refresh: () => Promise<void>;
  add: (workspace: WorkspaceResponse) => void;
}

export const WorkspacesContext = createContext<WorkspacesContextValue | null>(
  null,
);

