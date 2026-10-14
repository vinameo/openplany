import type {
  MessageKey,
  RolesResponse,
  UpdateRolePermissionsRequest,
} from "@repo/contracts";
import { request } from "../../../../lib/apiClient";

export const GENERIC_LOAD_ROLES_ERROR_KEY: MessageKey =
  "admin:roles.errors.loadFailed";

export const GENERIC_UPDATE_ROLES_ERROR_KEY: MessageKey =
  "admin:roles.errors.updateFailed";

export const adminRolesApi = {
  list(): Promise<RolesResponse> {
    return request<RolesResponse>(
      "/api/admin/roles",
      undefined,
      GENERIC_LOAD_ROLES_ERROR_KEY,
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
      GENERIC_UPDATE_ROLES_ERROR_KEY,
    );
  },
};
