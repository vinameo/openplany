import { useMemo } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useParams,
  useResolvedPath,
} from "react-router";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { WorkspaceChrome } from "../../workspaces/shell/WorkspaceChrome";
import { CreateWorkItemProvider } from "../../workItems/create/CreateWorkItemProvider";
import { canonicalProjectIdentifier, projectPath } from "../projectPaths";
import {
  CurrentProjectContext,
  type CurrentProjectValue,
} from "./currentProjectContext";
import { ProjectErrorPage } from "./ProjectErrorPage";
import { useProject } from "./useProject";

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

  let body: React.ReactNode;
  if (canonical.kind === "invalid" || state.status === "not_found") {
    body = <ProjectErrorPage status={404} />;
  } else if (state.status === "forbidden") {
    body = <ProjectErrorPage status={403} />;
  } else {
    body = (
      <CurrentProjectContext value={contextValue}>
        <WorkspaceChrome>
          <Outlet />
        </WorkspaceChrome>
      </CurrentProjectContext>
    );
  }

  return (
    <CreateWorkItemProvider slug={workspace.slug} reloadProject={reload}>
      {body}
    </CreateWorkItemProvider>
  );
}
