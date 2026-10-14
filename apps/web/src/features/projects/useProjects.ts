import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectListItem, ProjectListResponse } from "@repo/contracts";
import { translate } from "../../i18n/language";
import { ApiRequestError } from "../../lib/apiClient";
import { useAuth } from "../auth/useAuth";
import { useCurrentWorkspace } from "../workspaces/currentWorkspace/useCurrentWorkspace";
import { projectsApi } from "./api/projectsApi";
import { addProjectToCache, projectKeys } from "./api/projectQueries";

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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: projectKeys.list(slug),
    queryFn: ({ signal }) => projectsApi.list(slug, signal),
  });

  // 401 ends the session; 403/404 mean the workspace changed under us.
  const { error } = query;
  useEffect(() => {
    if (!(error instanceof ApiRequestError)) return;
    if (error.status === 401) expireSession();
    else if (error.status === 403 || error.status === 404) {
      void reloadWorkspace();
    }
  }, [error, expireSession, reloadWorkspace]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const addProject = useCallback(
    (item: ProjectListItem) => {
      addProjectToCache(queryClient, slug, item);
    },
    [queryClient, slug],
  );

  const state: ProjectsState = query.isSuccess
    ? { status: "ready", data: query.data }
    : query.isError
      ? { status: "error", message: translate("project:list.loadError") }
      : { status: "loading" };

  return { state, reload, addProject };
}
