import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useParams } from "react-router";
import type { WorkspaceResponse } from "@repo/contracts";
import { workspaceSlugProblem } from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../layout/AppHeader";
import { workspaceApi } from "../api/workspaceApi";
import {
  CurrentWorkspaceContext,
  type CurrentWorkspaceValue,
} from "../currentWorkspace/currentWorkspaceContext";
import { useWorkspaces } from "../useWorkspaces";
import { WorkspaceNotFound } from "./WorkspaceNotFound";

export function WorkspaceLayout() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { expireSession } = useAuth();
  const { state: wsState, replace } = useWorkspaces();

  const wsStateRef = useRef(wsState);
  useEffect(() => {
    wsStateRef.current = wsState;
  }, [wsState]);

  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(() => {
    if (workspaceSlug && wsState.status === "ready") {
      return wsState.workspaces.find((w) => w.slug === workspaceSlug) ?? null;
    }
    return null;
  });
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">(
    workspace ? "ready" : "loading",
  );

  const problem = workspaceSlug ? workspaceSlugProblem(workspaceSlug) : "INVALID";

  useEffect(() => {
    if (!workspaceSlug || problem === "INVALID") {
      return;
    }

    const currentCached =
      wsStateRef.current.status === "ready"
        ? wsStateRef.current.workspaces.find((w) => w.slug === workspaceSlug) ?? null
        : null;

    setWorkspace(currentCached);
    if (!currentCached) {
      setStatus("loading");
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

  const applyWorkspaceUpdate = useCallback(
    (updated: WorkspaceResponse) => {
      setWorkspace(updated);
      replace(updated);
    },
    [replace],
  );

  const reload = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      const data = await workspaceApi.get(workspaceSlug);
      setWorkspace(data);
      replace(data);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.status === 401) {
        expireSession();
      }
    }
  }, [workspaceSlug, replace, expireSession]);

  const contextValue = useMemo<CurrentWorkspaceValue | null>(() => {
    if (!workspace) return null;
    return {
      workspace,
      applyWorkspaceUpdate,
      reload,
    };
  }, [workspace, applyWorkspaceUpdate, reload]);

  if (!workspaceSlug || problem === "INVALID" || status === "not_found") {
    return <WorkspaceNotFound />;
  }

  if (!workspace || !contextValue) {
    return (
      <>
        <AppHeader currentWorkspace={undefined} />
        <div style={{ minHeight: "calc(100dvh - var(--app-header-height))" }} />
      </>
    );
  }

  return (
    <CurrentWorkspaceContext value={contextValue}>
      <AppHeader currentWorkspace={workspace} />
      <Outlet />
    </CurrentWorkspaceContext>
  );
}
