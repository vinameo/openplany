import { Injectable } from '@nestjs/common';
import type { PermissionItem, RoleScope } from '@repo/contracts';
import { DataSource } from 'typeorm';
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
    const rows = await this.dataSource.query<
      {
        scope: RoleScope;
        key: string;
        version: number;
        permissions: string[];
      }[]
    >(
      `SELECT r.scope, r.key, r.permissions_version AS version,
              COALESCE((SELECT array_agg(rp.permission_key ORDER BY rp.permission_key)
                        FROM role_permissions rp
                        WHERE rp.scope = r.scope AND rp.role_key = r.key), '{}') AS permissions
       FROM roles r
       ORDER BY r.scope, r.key`,
    );

    return rows.map((r) => ({
      scope: r.scope,
      key: r.key,
      version: Number(r.version),
      permissions: r.permissions ?? [],
    }));
  }

  async listPermissions(): Promise<PermissionItem[]> {
    const rows = await this.dataSource.query<
      {
        key: string;
        scope: RoleScope;
        label: string;
      }[]
    >(`SELECT key, scope, label FROM permissions ORDER BY key`);

    return rows.map((r) => ({
      key: r.key,
      scope: r.scope,
      label: r.label,
    }));
  }

  async applyChanges(
    refs: readonly { scope: RoleScope; key: string }[],
    planFn: (current: readonly StoredRolePermissions[]) => RolePermissionsPlan,
    context: ApplyRolePermissionsContext,
  ): Promise<RolePermissionsPlan> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock roles in deterministic order: (scope, key)
      const sortedRefs = [...refs].sort((a, b) => {
        const scopeCmp = a.scope.localeCompare(b.scope);
        if (scopeCmp !== 0) return scopeCmp;
        return a.key.localeCompare(b.key);
      });

      const scopes = sortedRefs.map((r) => r.scope);
      const keys = sortedRefs.map((r) => r.key);

      const lockedRows = await manager.query<
        {
          scope: RoleScope;
          key: string;
          version: number;
          permissions: string[];
        }[]
      >(
        `SELECT r.scope, r.key, r.permissions_version AS version,
                COALESCE((SELECT array_agg(rp.permission_key ORDER BY rp.permission_key)
                          FROM role_permissions rp
                          WHERE rp.scope = r.scope AND rp.role_key = r.key), '{}') AS permissions
         FROM roles r
         JOIN (
           SELECT * FROM unnest($1::varchar[], $2::varchar[]) AS u(scope, key)
         ) target ON target.scope = r.scope AND target.key = r.key
         ORDER BY r.scope, r.key
         FOR UPDATE`,
        [scopes, keys],
      );

      const currentStored: StoredRolePermissions[] = lockedRows.map((r) => ({
        scope: r.scope,
        key: r.key,
        version: Number(r.version),
        permissions: r.permissions ?? [],
      }));

      // 2. Call plan
      const plan = planFn(currentStored);
      if (plan.status !== 'ok') {
        return plan;
      }

      // 3. Grants: insert into role_permissions
      if (plan.grants.length > 0) {
        const grantScopes = plan.grants.map((g) => g.scope);
        const grantRoleKeys = plan.grants.map((g) => g.key);
        const grantPermKeys = plan.grants.map((g) => g.permission);
        const grantAts = plan.grants.map(() => context.now);

        await manager.query(
          `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
           SELECT * FROM unnest(
             $1::varchar[], $2::varchar[], $3::varchar[], $4::timestamptz[]
           )`,
          [grantScopes, grantRoleKeys, grantPermKeys, grantAts],
        );
      }

      // 4. Revokes: delete from role_permissions
      if (plan.revokes.length > 0) {
        const revokeScopes = plan.revokes.map((r) => r.scope);
        const revokeRoleKeys = plan.revokes.map((r) => r.key);
        const revokePermKeys = plan.revokes.map((r) => r.permission);

        await manager.query(
          `DELETE FROM role_permissions
           WHERE (scope, role_key, permission_key) IN (
             SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[])
           )`,
          [revokeScopes, revokeRoleKeys, revokePermKeys],
        );
      }

      // 5. History logging for both grants and revokes
      const allHistory = [
        ...plan.grants.map((g) => ({ ...g, changeType: 'granted' })),
        ...plan.revokes.map((r) => ({ ...r, changeType: 'revoked' })),
      ];

      if (allHistory.length > 0) {
        const histScopes = allHistory.map((h) => h.scope);
        const histRoleKeys = allHistory.map((h) => h.key);
        const histPermKeys = allHistory.map((h) => h.permission);
        const histChangeTypes = allHistory.map((h) => h.changeType);
        const histActorIds = allHistory.map(() => context.actorId);
        const histRequestIds = allHistory.map(() => context.requestId);
        const histAts = allHistory.map(() => context.now);

        await manager.query(
          `INSERT INTO role_permission_history
             (scope, role_key, permission_key, change_type, actor_id, request_id, created_at)
           SELECT * FROM unnest(
             $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[],
             $5::uuid[], $6::varchar[], $7::timestamptz[]
           )`,
          [
            histScopes,
            histRoleKeys,
            histPermKeys,
            histChangeTypes,
            histActorIds,
            histRequestIds,
            histAts,
          ],
        );
      }

      // 6. Update permissions_version for changed roles only
      if (plan.changedRoles.length > 0) {
        const changedScopes = plan.changedRoles.map((r) => r.scope);
        const changedKeys = plan.changedRoles.map((r) => r.key);

        await manager.query(
          `UPDATE roles
           SET permissions_version = permissions_version + 1, updated_at = $1
           WHERE (scope, key) IN (
             SELECT * FROM unnest($2::varchar[], $3::varchar[])
           )`,
          [context.now, changedScopes, changedKeys],
        );
      }

      return plan;
    });
  }
}

