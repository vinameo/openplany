import type {
  RolesResponse,
  UpdateRolePermissionsRequest,
} from "@repo/contracts";
import { request } from "../../../../lib/apiClient";

export const GENERIC_LOAD_ROLES_ERROR = "Couldn't load permissions.";
export const GENERIC_UPDATE_ROLES_ERROR =
  "Couldn't update permissions. Please try again.";

export const adminRolesApi = {
  list(): Promise<RolesResponse> {
    return request<RolesResponse>(
      "/api/admin/roles",
      undefined,
      GENERIC_LOAD_ROLES_ERROR,
    );
  },

  updatePermissions(
    body: UpdateRolePermissionsRequest,
  ): Promise<RolesResponse> {
    return request<RolesResponse>(
      "/api/admin/role-permissions",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      GENERIC_UPDATE_ROLES_ERROR,
    );
  },
};

