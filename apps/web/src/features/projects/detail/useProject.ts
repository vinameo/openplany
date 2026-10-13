import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectListItem, ProjectListResponse } from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useAuth } from "../../auth/useAuth";
import { projectsApi } from "../api/projectsApi";
import { projectKeys, replaceProjectInCache } from "../api/projectQueries";

export type ProjectState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; project: ProjectListItem }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "error" };

/** 403/404 end on an error page; anything but 401 is otherwise retryable. */
function errorState(err: unknown): ProjectState | null {
  if (err instanceof ApiRequestError) {
    if (err.status === 403) return { status: "forbidden" };
    if (err.status === 404) return { status: "not_found" };
  }
  return null;
}

export interface UseProjectResult {
  state: ProjectState;
  /** Shows the loading state again and refetches (after an error). */
  retry: () => void;
  /**
   * Refetches while the current project stays on screen, e.g. after another
   * page changed it. Rejects on a retryable failure so the caller can report
   * it; the current project is kept.
   */
  reload: () => Promise<void>;
  /** Puts a project returned by a successful write on screen without a refetch. */
  replace: (project: ProjectListItem) => void;
}

export function useProject(
  slug: string,
  identifier: string | null,
): UseProjectResult {
  const { expireSession } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: projectKeys.detail(slug, identifier ?? ""),
    queryFn: ({ signal }) =>
      projectsApi.get(slug, identifier ?? "", signal).then((r) => r.project),
    enabled: identifier !== null,
    // Opened from the list: show that row at once, then let the server
    // re-check access (staleTime 0) before anything else is trusted.
    initialData: () =>
      queryClient
        .getQueryData<ProjectListResponse>(projectKeys.list(slug))
        ?.projects.find((p) => p.identifier === identifier),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(projectKeys.list(slug))?.dataUpdatedAt,
    staleTime: 0,
  });

  const { error } = query;
  useEffect(() => {
    if (error instanceof ApiRequestError && error.status === 401) {
      expireSession();
    }
  }, [error, expireSession]);

  const retry = useCallback(() => {
    void queryClient.resetQueries({
      queryKey: projectKeys.detail(slug, identifier ?? ""),
      exact: true,
    });
  }, [queryClient, slug, identifier]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    const result = await refetch();
    if (result.error && errorState(result.error) === null) throw result.error;
  }, [refetch]);

  const replace = useCallback(
    (project: ProjectListItem) => {
      replaceProjectInCache(queryClient, slug, project);
    },
    [queryClient, slug],
  );

  let state: ProjectState;
  if (identifier === null) state = { status: "idle" };
  else if (query.isError) {
    // A failed reload keeps the project on screen unless access was lost.
    state =
      errorState(query.error) ??
      (query.data
        ? { status: "ready", project: query.data }
        : { status: "error" });
  } else if (query.isSuccess) state = { status: "ready", project: query.data };
  else state = { status: "loading" };

  return { state, retry, reload, replace };
}
