import { Outlet } from "react-router";
import { SidebarShell } from "../../workspaces/shell/SidebarShell";
import { useCurrentProject } from "./currentProjectContext";
import { ProjectLoadError } from "./ProjectLoadError";
import { ProjectPageHeader } from "./ProjectPageHeader";
import { ProjectSidebarContent } from "./ProjectSidebarContent";

export function ProjectShell() {
  const { status, retry } = useCurrentProject();
  return (
    <SidebarShell
      navLabel="Project"
      sidebar={<ProjectSidebarContent />}
      header={<ProjectPageHeader />}
    >
      {status === "error" ? <ProjectLoadError onRetry={retry} /> : <Outlet />}
    </SidebarShell>
  );
}
