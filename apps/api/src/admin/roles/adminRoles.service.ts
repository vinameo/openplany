import {
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  PROJECT_ROLES,
  WORKSPACE_ROLES,
  isRoleLocked,
  type ProjectPermission,
  type RolePermissionsChange,
  type RoleResponse,
  type RolesResponse,
  type WorkspacePermission,
} from '@repo/contracts';
import { Clock } from '../../auth/clock.js';
import { ApiException } from '../../common/apiException.js';
import {
  planRolePermissionChanges,
  type StoredRolePermissions,
} from './rolePermissionsPlan.js';
import { RolePermissionsRepository } from './repositories/rolePermissionsRepository.js';

@Injectable()
export class AdminRolesService {
  private readonly logger = new Logger(AdminRolesService.name);

  constructor(
    private readonly repository: RolePermissionsRepository,
    private readonly clock: Clock,
  ) {}

  async getRoles(): Promise<RolesResponse> {
    const [stored, permissions] = await Promise.all([
      this.repository.listRoles(),
      this.repository.listPermissions(),
    ]);
    const roles = this.formatRoles(stored);
    return { roles, permissions };
  }

  async updateRolePermissions(
    actorId: string,
    changes: readonly RolePermissionsChange[],
    requestId: string,
  ): Promise<RolesResponse> {
    const permissions = await this.repository.listPermissions();
    const validPerms = new Set(permissions.map((p) => p.key));

    // 1. Validation groups 1 & 2 before transaction (API-35)
    const prePlan = planRolePermissionChanges([], changes, validPerms);
    if (prePlan.status === 'invalid') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Validation failed',
        { fields: prePlan.fields },
      );
    }

    const refs = changes.map((c) => ({ scope: c.scope, key: c.key }));

    // 2. Transaction with row locks and plan execution
    let planResult;
    try {
      planResult = await this.repository.applyChanges(
        refs,
        (current) => planRolePermissionChanges(current, changes, validPerms),
        {
          actorId,
          requestId,
          now: this.clock.now(),
        },
      );
    } catch (err: unknown) {
      if (
        err !== null &&
        typeof err === 'object' &&
        'driverError' in err &&
        typeof (err as { driverError: unknown }).driverError === 'object' &&
        (err as { driverError: { code?: string } }).driverError?.code === '23503'
      ) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Foreign key violation',
        );
      }
      throw err;
    }

    if (planResult.status === 'conflict') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ROLE_PERMISSIONS_CHANGED',
        'Someone else changed these permissions. Reload to see the latest.',
      );
    }

    if (planResult.status === 'invalid') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Validation failed',
        { fields: planResult.fields },
      );
    }

    // 3. Log each changed role
    for (const role of planResult.changedRoles) {
      const granted = planResult.grants.filter(
        (g) => g.scope === role.scope && g.key === role.key,
      ).length;
      const revoked = planResult.revokes.filter(
        (r) => r.scope === role.scope && r.key === role.key,
      ).length;

      this.logger.log(
        `admin.role_permissions.changed scope=${role.scope} role=${role.key} ` +
          `granted=${granted} revoked=${revoked} actorId=${actorId} requestId=${requestId}`,
      );
    }

    return this.getRoles();
  }

  private formatRoles(stored: readonly StoredRolePermissions[]): RoleResponse[] {
    const storedMap = new Map<string, StoredRolePermissions>();
    for (const s of stored) {
      storedMap.set(`${s.scope}.${s.key}`, s);
    }

    const orderedRoles: RoleResponse[] = [];

    // Workspace roles in WORKSPACE_ROLES order (rank descending)
    for (const key of WORKSPACE_ROLES) {
      const s = storedMap.get(`workspace.${key}`);
      const perms = (s ? s.permissions : []) as WorkspacePermission[];
      orderedRoles.push({
        scope: 'workspace',
        key,
        locked: isRoleLocked({ scope: 'workspace', key }),
        version: s ? s.version : 1,
        permissions: perms,
      });
    }

    // Project roles in PROJECT_ROLES order (rank descending)
    for (const key of PROJECT_ROLES) {
      const s = storedMap.get(`project.${key}`);
      const perms = (s ? s.permissions : []) as ProjectPermission[];
      orderedRoles.push({
        scope: 'project',
        key,
        locked: isRoleLocked({ scope: 'project', key }),
        version: s ? s.version : 1,
        permissions: perms,
      });
    }

    return orderedRoles;
  }
}

