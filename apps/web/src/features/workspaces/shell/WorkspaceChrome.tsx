import type { ReactNode } from "react";
import { AppHeader } from "../../layout/AppHeader";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import { WorkspaceFrame } from "./WorkspaceFrame";

export function WorkspaceChrome({ children }: { children: ReactNode }) {
  const { workspace } = useCurrentWorkspace();
  return (
    <>
      <AppHeader currentWorkspace={workspace} variant="workspace" />
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </>
  );
}
