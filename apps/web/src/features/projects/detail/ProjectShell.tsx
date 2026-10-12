import { Outlet } from "react-router";
import type { ProjectListItem } from "@repo/contracts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { SidebarShell } from "../../workspaces/shell/SidebarShell";
import { useCurrentProject } from "./currentProjectContext";
import { ProjectLoadError } from "./ProjectLoadError";
import { ProjectPageHeader } from "./ProjectPageHeader";
import { ProjectSidebarContent } from "./ProjectSidebarContent";

function ProjectDocumentTitle({
  project,
  workspaceName,
}: {
  project: ProjectListItem;
  workspaceName: string;
}) {
  useDocumentTitle(`${project.name} · ${workspaceName}`);
  return null;
}

export function ProjectShell() {
  const { workspace } = useCurrentWorkspace();
  const { status, project, retry } = useCurrentProject();
  return (
    <>
      {project !== null && (
        <ProjectDocumentTitle
          project={project}
          workspaceName={workspace.name}
        />
      )}
      <SidebarShell
        navLabel="Project"
        sidebar={<ProjectSidebarContent />}
        header={<ProjectPageHeader />}
      >
        {status === "error" ? <ProjectLoadError onRetry={retry} /> : <Outlet />}
      </SidebarShell>
    </>
  );
}

