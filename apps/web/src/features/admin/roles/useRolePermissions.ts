import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PermissionItem,
  ProjectAccessPolicyResponse,
  RoleResponse,
  UpdateRolePermissionsRequest,
} from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { adminRolesApi } from "./api/adminRolesApi";
import { adminRoleKeys, rolesLoadError } from "./api/adminRoleQueries";

export type RolePermissionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      roles: RoleResponse[];
      permissions: PermissionItem[];
      projectAccessPolicies: ProjectAccessPolicyResponse[];
    };

export type SaveResult =
  | { status: "saved" }
  | { status: "conflict" }
  | { status: "invalid"; fields: Record<string, string> }
  | { status: "failed"; message: string };

export function useRolePermissions(): {
  state: RolePermissionsState;
  reload: () => void;
  save: (body: UpdateRolePermissionsRequest) => Promise<SaveResult>;
} {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: adminRoleKeys.roles,
    queryFn: () => adminRolesApi.list(),
    retry: false,
  });

  const state: RolePermissionsState = useMemo(() => {
    if (isLoading || (!data && !isError)) {
      return { status: "loading" };
    }
    if (isError || !data) {
      return { status: "error", message: rolesLoadError };
    }
    return {
      status: "ready",
      roles: data.roles,
      permissions: data.permissions,
      projectAccessPolicies: data.projectAccessPolicies ?? [],
    };
  }, [isLoading, isError, data]);

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const save = useCallback(
    async (body: UpdateRolePermissionsRequest): Promise<SaveResult> => {
      try {
        const response = await adminRolesApi.updatePermissions(body);
        queryClient.setQueryData(adminRoleKeys.roles, response);
        return { status: "saved" };
      } catch (err: unknown) {
        if (err instanceof ApiRequestError) {
          if (err.status === 409 || err.code === "ROLE_PERMISSIONS_CHANGED") {
            return { status: "conflict" };
          }
          if (
            err.status === 400 &&
            (err.code === "VALIDATION_ERROR" ||
              Object.keys(err.fields).length > 0)
          ) {
            return { status: "invalid", fields: err.fields };
          }
          return { status: "failed", message: err.message };
        }
        return {
          status: "failed",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't update permissions. Please try again.",
        };
      }
    },
    [queryClient],
  );

  return {
    state,
    reload,
    save,
  };
}
