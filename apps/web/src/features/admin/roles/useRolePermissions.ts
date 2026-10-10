import { useCallback, useEffect, useState } from "react";
import type {
  PermissionItem,
  RoleResponse,
  UpdateRolePermissionsRequest,
} from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { adminRolesApi } from "./api/adminRolesApi";

export type RolePermissionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; roles: RoleResponse[]; permissions: PermissionItem[] };

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
  const [state, setState] = useState<RolePermissionsState>({
    status: "loading",
  });
  const [reloadIndex, setReloadIndex] = useState(0);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setReloadIndex((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchRoles() {
      try {
        const response = await adminRolesApi.list();
        if (!cancelled) {
          setState({
            status: "ready",
            roles: response.roles,
            permissions: response.permissions,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Couldn't load permissions.";
          setState({ status: "error", message });
        }
      }
    }

    void fetchRoles();

    return () => {
      cancelled = true;
    };
  }, [reloadIndex]);

  const save = useCallback(
    async (body: UpdateRolePermissionsRequest): Promise<SaveResult> => {
      try {
        const response = await adminRolesApi.updatePermissions(body);
        setState({
          status: "ready",
          roles: response.roles,
          permissions: response.permissions,
        });
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
    [],
  );

  return {
    state,
    reload,
    save,
  };
}

