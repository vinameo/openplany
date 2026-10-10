import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WorkspaceResponse } from "@repo/contracts";
import { ApiRequestError } from "../../lib/apiClient";
import { useAuth } from "../auth/useAuth";
import { workspaceApi } from "./api/workspaceApi";
import {
  WorkspacesContext,
  type WorkspacesContextValue,
  type WorkspacesState,
} from "./workspaceContext";

const collator = new Intl.Collator("vi", { sensitivity: "base" });

function sortWorkspaces(list: WorkspaceResponse[]): WorkspaceResponse[] {
  return list.toSorted((a, b) => collator.compare(a.name, b.name));
}

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { expireSession } = useAuth();
  const [state, setState] = useState<WorkspacesState>({ status: "loading" });

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await workspaceApi.list();
      setState({
        status: "ready",
        workspaces: sortWorkspaces(data.workspaces),
        lastWorkspaceSlug: data.lastWorkspaceSlug,
      });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 401) {
        expireSession();
        return;
      }
      console.error("Could not load workspaces", error);
      setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
      throw error;
    }
  }, [expireSession]);

  useEffect(() => {
    let cancelled = false;
    workspaceApi.list().then(
      (data) => {
        if (cancelled) return;
        setState({
          status: "ready",
          workspaces: sortWorkspaces(data.workspaces),
          lastWorkspaceSlug: data.lastWorkspaceSlug,
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          expireSession();
          return;
        }
        console.error("Could not load workspaces", error);
        setState({ status: "error" });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [expireSession]);

  const add = useCallback((workspace: WorkspaceResponse) => {
    setState((current) => {
      const existing = current.status === "ready" ? current.workspaces : [];
      const updated = sortWorkspaces([...existing, workspace]);
      return {
        status: "ready",
        workspaces: updated,
        lastWorkspaceSlug: workspace.slug,
      };
    });
  }, []);

  const replace = useCallback((workspace: WorkspaceResponse) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      const nextWorkspaces = current.workspaces.map((w) =>
        w.id === workspace.id ? workspace : w,
      );
      return {
        ...current,
        workspaces: sortWorkspaces(nextWorkspaces),
      };
    });
  }, []);

  const value = useMemo<WorkspacesContextValue>(
    () => ({
      state,
      refresh: loadWorkspaces,
      add,
      replace,
    }),
    [state, loadWorkspaces, add, replace],
  );

  return (
    <WorkspacesContext value={value}>{children}</WorkspacesContext>
  );
}

