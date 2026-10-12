import { useMemo } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import type { ProjectListItem } from "@repo/contracts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { WorkspaceChrome } from "../../workspaces/shell/WorkspaceChrome";
import { canonicalProjectIdentifier } from "../projectPaths";
import {
  CurrentProjectContext,
  type CurrentProjectValue,
} from "./currentProjectContext";
import { ProjectErrorPage } from "./ProjectErrorPage";
import { ProjectShell } from "./ProjectShell";
import { useProject } from "./useProject";

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

export function ProjectLayout() {
  const { projectIdentifier = "" } = useParams();
  const canonical = canonicalProjectIdentifier(projectIdentifier);
  const location = useLocation();
  const { workspace } = useCurrentWorkspace();
  const { state, retry } = useProject(
    workspace.slug,
    canonical.kind === "canonical" ? canonical.identifier : null,
  );

  const contextValue = useMemo<CurrentProjectValue>(() => {
    return {
      project: state.status === "ready" ? state.project : null,
      status:
        state.status === "ready"
          ? "ready"
          : state.status === "error"
            ? "error"
            : "loading",
      retry,
    };
  }, [state, retry]);

  if (canonical.kind === "redirect") {
    const projectsIndex = location.pathname.indexOf("/projects/");
    const prefix =
      projectsIndex >= 0
        ? location.pathname.slice(0, projectsIndex + "/projects/".length)
        : `/${encodeURIComponent(workspace.slug)}/projects/`;
    const rest =
      projectsIndex >= 0
        ? location.pathname.slice(projectsIndex + "/projects/".length)
        : "";
    const slashIdx = rest.indexOf("/");
    const suffix = slashIdx >= 0 ? rest.slice(slashIdx) : "";
    const newPathname = `${prefix}${canonical.identifier}${suffix}`;

    return (
      <Navigate
        replace
        to={{
          pathname: newPathname,
          search: location.search,
          hash: location.hash,
        }}
      />
    );
  }

  if (canonical.kind === "invalid" || state.status === "not_found") {
    return <ProjectErrorPage status={404} />;
  }

  if (state.status === "forbidden") {
    return <ProjectErrorPage status={403} />;
  }

  return (
    <CurrentProjectContext value={contextValue}>
      {state.status === "ready" && (
        <ProjectDocumentTitle
          project={state.project}
          workspaceName={workspace.name}
        />
      )}
      <WorkspaceChrome>
        <ProjectShell />
      </WorkspaceChrome>
    </CurrentProjectContext>
  );
}
