import { Outlet } from "react-router";
import { SidebarShell } from "./SidebarShell";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { WorkspaceSidebarContent } from "./WorkspaceSidebarContent";

export function WorkspaceShell() {
  return (
    <SidebarShell
      navLabel="Workspace"
      sidebar={<WorkspaceSidebarContent />}
      header={<WorkspacePageHeader />}
    >
      <Outlet />
    </SidebarShell>
  );
}
