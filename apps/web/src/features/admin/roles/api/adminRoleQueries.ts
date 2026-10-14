import { adminRolesApi } from "./adminRolesApi.js";

export const adminRoleKeys = {
  roles: ["admin", "roles"] as const,
};

export const rolesQueryOptions = {
  queryKey: adminRoleKeys.roles,
  queryFn: () => adminRolesApi.list(),
};
