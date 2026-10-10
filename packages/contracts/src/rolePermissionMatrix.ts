import type { WorkspaceRole } from './workspace.js';
import type { WorkspacePermission } from './workspacePermissions.js';
import type { ProjectRolePermissions } from './projectPermissions.js';

export interface RolePermissionMatrix {
  readonly workspace: Readonly<
    Record<WorkspaceRole, readonly WorkspacePermission[]>
  >;
  readonly project: ProjectRolePermissions;
}
