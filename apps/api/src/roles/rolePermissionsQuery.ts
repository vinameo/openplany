import type { RoleScope } from '@repo/contracts';
import { In, type EntityManager } from 'typeorm';
import { RolePermission } from './entities/rolePermission.entity.js';

/**
 * The single place that reads granted permissions from role_permissions.
 * Returns `scope.roleKey` → permission keys sorted A–Z; roles without any
 * grant are absent (callers default to []).
 */
export async function loadRolePermissions(
  manager: EntityManager,
  roles: readonly { scope: RoleScope; key: string }[],
): Promise<Map<string, string[]>> {
  const byRole = new Map<string, string[]>();
  if (roles.length === 0) return byRole;

  const scopes = [...new Set(roles.map((role) => role.scope))];
  const keys = [...new Set(roles.map((role) => role.key))];
  const rows = await manager.find(RolePermission, {
    select: { scope: true, roleKey: true, permissionKey: true },
    where: { scope: In(scopes), roleKey: In(keys) },
    order: { permissionKey: 'ASC' },
  });

  for (const row of rows) {
    const id = rolePermissionsKey(row.scope, row.roleKey);
    const permissions = byRole.get(id);
    if (permissions === undefined) byRole.set(id, [row.permissionKey]);
    else permissions.push(row.permissionKey);
  }
  return byRole;
}

export function rolePermissionsKey(scope: RoleScope, roleKey: string): string {
  return `${scope}.${roleKey}`;
}
