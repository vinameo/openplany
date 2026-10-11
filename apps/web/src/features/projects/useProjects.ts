import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectListItem, ProjectListResponse } from "@repo/contracts";
import { ApiRequestError } from "../../lib/apiClient";
import { useAuth } from "../auth/useAuth";
import { useCurrentWorkspace } from "../workspaces/currentWorkspace/useCurrentWorkspace";
import { projectsApi } from "./api/projectsApi";

export type ProjectsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ProjectListResponse };

export function useProjects(slug: string): {
  state: ProjectsState;
  reload: () => Promise<void>;
  addProject: (item: ProjectListItem) => void;
} {
  const { reload: reloadWorkspace } = useCurrentWorkspace();
  const { expireSession } = useAuth();
  const [state, setState] = useState<ProjectsState>({ status: "loading" });
  const [prevSlug, setPrevSlug] = useState(slug);
  const activeControllerRef = useRef<AbortController | null>(null);

  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setState({ status: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    activeControllerRef.current = controller;

    projectsApi.list(slug, controller.signal).then(
      (data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      },
      (err: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        if (err instanceof ApiRequestError) {
          if (err.status === 401) {
            expireSession();
            return;
          }
          if (err.status === 403 || err.status === 404) {
            void reloadWorkspace().then(() => {
              if (!cancelled) {
                setState({
                  status: "error",
                  message: "Couldn't load projects.",
                });
              }
            });
            return;
          }
        }
        const message =
          err instanceof Error ? err.message : "Couldn't load projects.";
        setState({ status: "error", message });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [expireSession, reloadWorkspace, slug]);

  const reload = useCallback(async () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      const data = await projectsApi.list(slug, controller.signal);
      setState({ status: "ready", data });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      if (err instanceof ApiRequestError) {
        if (err.status === 401) {
          expireSession();
          return;
        }
        if (err.status === 403 || err.status === 404) {
          await reloadWorkspace();
          setState({
            status: "error",
            message: "Couldn't load projects.",
          });
          return;
        }
      }
      const message =
        err instanceof Error ? err.message : "Couldn't load projects.";
      setState({ status: "error", message });
    }
  }, [expireSession, reloadWorkspace, slug]);

  const addProject = useCallback((item: ProjectListItem) => {
    setState((curr) => {
      if (curr.status !== "ready") return curr;
      return {
        status: "ready",
        data: {
          ...curr.data,
          projects: [item, ...curr.data.projects],
          total: curr.data.total + 1,
        },
      };
    });
  }, []);

  return { state, reload, addProject };
}
