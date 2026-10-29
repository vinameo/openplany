import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiRequestError } from "../../../../lib/apiClient";
import { useAuth } from "../../../auth/useAuth";
import { projectMembersApi } from "../../api/projectMembersApi";
import { projectKeys } from "../../api/projectQueries";

export function useProjectMembers(slug: string, identifier: string) {
  const { expireSession } = useAuth();
  const query = useQuery({
    queryKey: projectKeys.members(slug, identifier),
    queryFn: ({ signal }) => projectMembersApi.list(slug, identifier, signal),
    enabled: Boolean(slug && identifier),
  });

  const { error } = query;
  useEffect(() => {
    if (error instanceof ApiRequestError && error.status === 401) {
      expireSession();
    }
  }, [error, expireSession]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return { ...query, reload };
}
