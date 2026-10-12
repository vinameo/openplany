import { useMemo } from "react";
import {
  Navigate,
  useLocation,
  useParams,
  useResolvedPath,
} from "react-router";
import type { ProjectListItem } from "@repo/contracts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { WorkspaceChrome } from "../../workspaces/shell/WorkspaceChrome";
import { canonicalProjectIdentifier, projectPath } from "../projectPaths";
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
  // Pathname this route matched (`/<slug>/projects/<as typed>`), so the part
  // after it belongs to a child page, whatever the workspace slug is.
  const matchedPathname = useResolvedPath(".").pathname;
  const { workspace } = useCurrentWorkspace();
  const { state, retry, reload, replace } = useProject(
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
      reload,
      applyProjectUpdate: replace,
    };
  }, [state, retry, reload, replace]);

  if (canonical.kind === "redirect") {
    const childPath = location.pathname.startsWith(matchedPathname)
      ? location.pathname.slice(matchedPathname.length)
      : "";
    return (
      <Navigate
        replace
        to={{
          pathname: `${projectPath(workspace.slug, canonical.identifier)}${childPath}`,
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
