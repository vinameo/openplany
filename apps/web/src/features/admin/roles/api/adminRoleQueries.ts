import type { MessageKey } from "@repo/contracts";
import { translate } from "../../../../i18n/index.js";
import { adminRolesApi } from "./adminRolesApi.js";

export const adminRoleKeys = {
  roles: ["admin", "roles"] as const,
};

export const ROLES_LOAD_ERROR_KEY: MessageKey = "admin:roles.errors.loadFailed";
export const rolesLoadError = translate(ROLES_LOAD_ERROR_KEY);

export const rolesQueryOptions = {
  queryKey: adminRoleKeys.roles,
  queryFn: () => adminRolesApi.list(),
};
