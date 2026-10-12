import { useMemo } from "react";
import { useParams } from "react-router";
import type { ProjectListItem } from "@repo/contracts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { WorkspaceChrome } from "../../workspaces/shell/WorkspaceChrome";
import { canonicalProjectIdentifier } from "../projectPaths";
import {
  CurrentProjectContext,
  type CurrentProjectValue,
} from "./currentProjectContext";
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
