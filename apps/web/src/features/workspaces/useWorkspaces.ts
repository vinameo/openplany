import { useContext } from "react";
import {
  WorkspacesContext,
  type WorkspacesContextValue,
} from "./workspaceContext";

export function useWorkspaces(): WorkspacesContextValue {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error("useWorkspaces must be used within a WorkspaceProvider");
  }
  return context;
}

