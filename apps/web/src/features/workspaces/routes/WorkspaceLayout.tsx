import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router";
import type { WorkspaceResponse } from "@repo/contracts";
import { workspaceSlugProblem } from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../layout/AppHeader";
import { workspaceApi } from "../api/workspaceApi";
import { useWorkspaces } from "../useWorkspaces";
import { WorkspaceNotFound } from "./WorkspaceNotFound";

export function WorkspaceLayout() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { expireSession } = useAuth();
  const { state: wsState } = useWorkspaces();

  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(() => {
    if (workspaceSlug && wsState.status === "ready") {
      return wsState.workspaces.find((w) => w.slug === workspaceSlug) ?? null;
    }
    return null;
  });
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">(
    "loading",
  );

  const problem = workspaceSlug ? workspaceSlugProblem(workspaceSlug) : "INVALID";

  useEffect(() => {
    if (!workspaceSlug || problem === "INVALID") {
      return;
    }

    const controller = new AbortController();

    workspaceApi
      .get(workspaceSlug, controller.signal)
      .then((data) => {
        setWorkspace(data);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;

        if (err instanceof ApiRequestError) {
          if (err.status === 401) {
            expireSession();
            return;
          }
          if (err.status === 404) {
            setStatus("not_found");
            return;
          }
        }
        setStatus("not_found");
      });

    return () => {
      controller.abort();
    };
  }, [workspaceSlug, problem, expireSession]);

  if (!workspaceSlug || problem === "INVALID" || status === "not_found") {
    return <WorkspaceNotFound />;
  }

  return (
    <>
      <AppHeader currentWorkspace={workspace ?? undefined} />
      <Outlet context={workspace} />
    </>
  );
}
