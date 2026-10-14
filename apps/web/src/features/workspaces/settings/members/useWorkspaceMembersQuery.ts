import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { WorkspaceMemberListResponse } from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { useAuth } from "../../../auth/useAuth";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { membersApi } from "./api/membersApi";
import { workspaceMemberKeys } from "./api/workspaceMemberQueries";

export type MembersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: WorkspaceMemberListResponse };

export function useWorkspaceMembersQuery(slug: string): {
  state: MembersState;
  reload: () => Promise<void>;
} {
  const { t } = useTranslation();
  const { reload: reloadWorkspace } = useCurrentWorkspace();
  const { expireSession } = useAuth();

  const query = useQuery({
    queryKey: workspaceMemberKeys.list(slug),
    queryFn: ({ signal }) => membersApi.list(slug, signal),
    retry: false,
  });

  const isForbidden =
    query.isError &&
    query.error instanceof ApiRequestError &&
    query.error.status === 403;

  useEffect(() => {
    if (query.isError && query.error instanceof ApiRequestError) {
      if (query.error.status === 401) {
        expireSession();
      } else if (query.error.status === 403) {
        void reloadWorkspace();
      }
    }
  }, [query.isError, query.error, expireSession, reloadWorkspace]);

  const reload = useCallback(async () => {
    await query.refetch();
  }, [query]);

  let state: MembersState;
  if (isForbidden) {
    state = {
      status: "error",
      message: t("workspace:settings.members.forbiddenMessage"),
    };
  } else if (query.isPending || query.isLoading) {
    state = { status: "loading" };
  } else if (query.isError) {
    state = {
      status: "error",
      message: t("workspace:settings.members.loadError"),
    };
  } else if (query.data) {
    state = { status: "ready", data: query.data };
  } else {
    state = { status: "loading" };
  }

  return { state, reload };
}
