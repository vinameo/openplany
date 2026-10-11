import { Injectable } from '@nestjs/common';
import type { PermissionItem, RoleScope } from '@repo/contracts';
import { DataSource, type EntityManager } from 'typeorm';
import { Permission } from '../../../roles/entities/permission.entity.js';
import { Role } from '../../../roles/entities/role.entity.js';
import { RolePermission } from '../../../roles/entities/rolePermission.entity.js';
import { RolePermissionHistory } from '../../../roles/entities/rolePermissionHistory.entity.js';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../../roles/rolePermissionsQuery.js';
import type {
  RolePermissionsPlan,
  StoredRolePermissions,
} from '../rolePermissionsPlan.js';
import {
  RolePermissionsRepository,
  type ApplyRolePermissionsContext,
} from './rolePermissionsRepository.js';

@Injectable()
export class TypeOrmRolePermissionsRepository implements RolePermissionsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listRoles(): Promise<StoredRolePermissions[]> {
    const manager = this.dataSource.manager;
    const roles = await manager.find(Role, {
      order: { scope: 'ASC', key: 'ASC' },
    });
    return withPermissions(manager, roles);
  }

  async listPermissions(): Promise<PermissionItem[]> {
    const rows = await this.dataSource.manager.find(Permission, {
      select: { key: true, scope: true, label: true },
      order: { key: 'ASC' },
    });
    return rows.map((r) => ({ key: r.key, scope: r.scope, label: r.label }));
  }

  async applyChanges(
    refs: readonly { scope: RoleScope; key: string }[],
    planFn: (current: readonly StoredRolePermissions[]) => RolePermissionsPlan,
    context: ApplyRolePermissionsContext,
  ): Promise<RolePermissionsPlan> {
    return this.dataSource.transaction(async (manager) => {
      // 1. SELECT … FOR UPDATE on the target roles, ordered by (scope, key)
      //    so concurrent saves always lock in the same order (no deadlock).
      const lockedRoles =
        refs.length === 0
          ? []
          : await manager.find(Role, {
              where: refs.map((ref) => ({ scope: ref.scope, key: ref.key })),
              order: { scope: 'ASC', key: 'ASC' },
              lock: { mode: 'pessimistic_write' },
            });
      const current = await withPermissions(manager, lockedRoles);

      // 2. Version check and guardrails, against the locked state.
      const plan = planFn(current);
      if (plan.status !== 'ok') {
        return plan;
      }

      // 3. Grants and revokes.
      if (plan.grants.length > 0) {
        await manager.insert(
          RolePermission,
          plan.grants.map((g) => ({
            scope: g.scope,
            roleKey: g.key,
            permissionKey: g.permission,
            createdAt: context.now,
          })),
        );
      }
      if (plan.revokes.length > 0) {
        await manager.delete(
          RolePermission,
          plan.revokes.map((r) => ({
            scope: r.scope,
            roleKey: r.key,
            permissionKey: r.permission,
          })),
        );
      }

      // 4. One history row per grant and revoke (append-only entity).
      const history = [
        ...plan.grants.map((g) => ({ ...g, changeType: 'granted' as const })),
        ...plan.revokes.map((r) => ({ ...r, changeType: 'revoked' as const })),
      ];
      if (history.length > 0) {
        await manager.insert(
          RolePermissionHistory,
          history.map((h) => ({
            scope: h.scope,
            roleKey: h.key,
            permissionKey: h.permission,
            changeType: h.changeType,
            actorId: context.actorId,
            requestId: context.requestId,
            createdAt: context.now,
          })),
        );
      }

      // 5. Bump permissions_version for changed roles only.
      //    The rows are already locked in step 1, so per-role writes are safe.
      for (const changed of plan.changedRoles) {
        const role = { scope: changed.scope, key: changed.key };
        await manager.increment(Role, role, 'permissionsVersion', 1);
        await manager.update(Role, role, { updatedAt: context.now });
      }

      return plan;
    });
  }
}

async function withPermissions(
  manager: EntityManager,
  roles: readonly Role[],
): Promise<StoredRolePermissions[]> {
  const permissions = await loadRolePermissions(manager, roles);
  return roles.map((role) => ({
    scope: role.scope,
    key: role.key,
    version: role.permissionsVersion,
    permissions:
      permissions.get(rolePermissionsKey(role.scope, role.key)) ?? [],
  }));
}
