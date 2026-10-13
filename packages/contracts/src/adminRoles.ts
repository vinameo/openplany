import type { WorkspaceRole } from "./workspace.js";
import type { WorkspacePermission } from "./workspacePermissions.js";
import type { ProjectRole } from "./projectRoles.js";
import type { ProjectPermission } from "./projectPermissions.js";
import type { RoleScope } from "./rolePermissionRules.js";
import type { ProjectAccessPolicy } from "./projectAccessPolicy.js";

export interface ProjectAccessPolicyResponse extends ProjectAccessPolicy {
  readonly locked: true;
}

export type RoleResponse =
  | {
      scope: "workspace";
      key: WorkspaceRole;
      locked: boolean;
      version: number;
      permissions: WorkspacePermission[];
    }
  | {
      scope: "project";
      key: ProjectRole;
      locked: boolean;
      version: number;
      permissions: ProjectPermission[];
    };

export interface PermissionItem {
  key: string;
  scope: RoleScope;
  label: string;
}

export type PermissionResponse = PermissionItem;

export interface RolesResponse {
  roles: RoleResponse[];
  permissions: PermissionItem[];
  projectAccessPolicies: ProjectAccessPolicyResponse[];
}

export interface RolePermissionsChange {
  scope: RoleScope;
  key: string;
  version: number;
  permissions: string[];
}

export interface UpdateRolePermissionsRequest {
  changes: RolePermissionsChange[];
}

export const ROLE_PERMISSIONS_CHANGES_MAX = 8;
export const ROLE_PERMISSIONS_PER_ROLE_MAX = 100;
