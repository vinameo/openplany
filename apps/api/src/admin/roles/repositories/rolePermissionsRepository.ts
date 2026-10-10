import type { PermissionItem, RoleScope } from '@repo/contracts';
import type {
  RolePermissionsPlan,
  StoredRolePermissions,
} from '../rolePermissionsPlan.js';

export interface ApplyRolePermissionsContext {
  actorId: string;
  requestId: string;
  now: Date;
}

export abstract class RolePermissionsRepository {
  abstract listRoles(): Promise<StoredRolePermissions[]>;
  abstract listPermissions(): Promise<PermissionItem[]>;
  abstract applyChanges(
    refs: readonly { scope: RoleScope; key: string }[],
    plan: (current: readonly StoredRolePermissions[]) => RolePermissionsPlan,
    context: ApplyRolePermissionsContext,
  ): Promise<RolePermissionsPlan>;
}

