import { useContext } from "react";
import {
  WorkspaceSidebarContext,
  type WorkspaceSidebarValue,
} from "./workspaceSidebarContext";

export function useWorkspaceSidebar(): WorkspaceSidebarValue {
  const value = useContext(WorkspaceSidebarContext);
  if (!value) {
    throw new Error("useWorkspaceSidebar must be used inside WorkspaceShell");
  }
  return value;
}
