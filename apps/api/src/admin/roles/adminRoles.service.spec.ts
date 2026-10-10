import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  PermissionItem,
  RolePermissionsChange,
} from '@repo/contracts';
import { Clock } from '../../auth/clock.js';
import { ApiException } from '../../common/apiException.js';
import { AdminRolesService } from './adminRoles.service.js';
import type {
  ApplyRolePermissionsContext,
  RolePermissionsRepository,
} from './repositories/rolePermissionsRepository.js';
import type {
  RolePermissionsPlan,
  StoredRolePermissions,
} from './rolePermissionsPlan.js';

class FakeClock extends Clock {
  private currentTime = new Date('2026-10-10T12:00:00.000Z');

  now(): Date {
    return this.currentTime;
  }

  async sleep(): Promise<void> {}
}

describe('AdminRolesService', () => {
  const samplePermissions: PermissionItem[] = [
    {
      key: 'workspace.settings.view',
      scope: 'workspace',
      label: 'View workspace settings',
    },
    {
      key: 'workspace.settings.update',
      scope: 'workspace',
      label: 'Edit workspace settings',
    },
    {
      key: 'project.settings.view',
      scope: 'project',
      label: 'View project settings',
    },
  ];

  const sampleStoredRoles: StoredRolePermissions[] = [
    {
      scope: 'workspace',
      key: 'admin',
      version: 1,
      permissions: ['workspace.settings.view', 'workspace.settings.update'],
    },
    {
      scope: 'workspace',
      key: 'member',
      version: 1,
      permissions: ['workspace.settings.view'],
    },
    {
      scope: 'workspace',
      key: 'guest',
      version: 1,
      permissions: ['workspace.settings.view'],
    },
    {
      scope: 'project',
      key: 'admin',
      version: 1,
      permissions: ['project.settings.view'],
    },
    {
      scope: 'project',
      key: 'contributor',
      version: 1,
      permissions: ['project.settings.view'],
    },
    {
      scope: 'project',
      key: 'commenter',
      version: 1,
      permissions: ['project.settings.view'],
    },
    {
      scope: 'project',
      key: 'guest',
      version: 1,
      permissions: ['project.settings.view'],
    },
  ];

  function setup() {
    const listRolesMock = vi.fn(async () => sampleStoredRoles);
    const listPermissionsMock = vi.fn(async () => samplePermissions);
    const applyChangesMock = vi.fn(
      async (
        _refs: readonly { scope: 'workspace' | 'project'; key: string }[],
        planFn: (current: readonly StoredRolePermissions[]) => RolePermissionsPlan,
        _ctx: ApplyRolePermissionsContext,
      ) => {
        return planFn(sampleStoredRoles);
      },
    );

    const repository: RolePermissionsRepository = {
      listRoles: listRolesMock,
      listPermissions: listPermissionsMock,
      applyChanges: applyChangesMock,
    };

    const clock = new FakeClock();
    const service = new AdminRolesService(repository, clock);

    return {
      service,
      repository,
      listRolesMock,
      listPermissionsMock,
      applyChangesMock,
    };
  }

  describe('getRoles', () => {
    it('queries both roles and permissions and includes permissions in RolesResponse', async () => {
      const { service, listRolesMock, listPermissionsMock } = setup();

      const result = await service.getRoles();

      expect(listRolesMock).toHaveBeenCalledTimes(1);
      expect(listPermissionsMock).toHaveBeenCalledTimes(1);
      expect(result.permissions).toEqual(samplePermissions);
      expect(result.roles).toHaveLength(7);

      const wsAdmin = result.roles.find(
        (r) => r.scope === 'workspace' && r.key === 'admin',
      );
      expect(wsAdmin).toBeDefined();
      expect(wsAdmin?.locked).toBe(true);
      expect(wsAdmin?.permissions).toEqual([
        'workspace.settings.view',
        'workspace.settings.update',
      ]);

      const wsMember = result.roles.find(
        (r) => r.scope === 'workspace' && r.key === 'member',
      );
      expect(wsMember).toBeDefined();
      expect(wsMember?.locked).toBe(false);
      expect(wsMember?.permissions).toEqual(['workspace.settings.view']);
    });
  });

  describe('updateRolePermissions', () => {
    it('applies valid changes and returns updated RolesResponse including permissions', async () => {
      const { service, applyChangesMock, listPermissionsMock } = setup();

      const validChange: RolePermissionsChange = {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: ['workspace.settings.view', 'workspace.settings.update'],
      };

      const result = await service.updateRolePermissions(
        'actor-uuid-1',
        [validChange],
        'req-123',
      );

      expect(applyChangesMock).toHaveBeenCalledTimes(1);
      expect(listPermissionsMock).toHaveBeenCalled();
      expect(result.permissions).toEqual(samplePermissions);
      expect(result.roles).toHaveLength(7);
    });

    it('throws BAD_REQUEST when changes violate pre-plan validation (e.g. unknown permission)', async () => {
      const { service, applyChangesMock } = setup();

      const invalidChange: RolePermissionsChange = {
        scope: 'workspace',
        key: 'member',
        version: 1,
        permissions: ['invalid.unknown.permission'],
      };

      await expect(
        service.updateRolePermissions('actor-uuid-1', [invalidChange], 'req-123'),
      ).rejects.toThrow(ApiException);

      expect(applyChangesMock).not.toHaveBeenCalled();
    });

    it('throws BAD_REQUEST when changes violate guardrails in repository plan (e.g. modifying locked role)', async () => {
      const { service, applyChangesMock } = setup();

      const lockedRoleChange: RolePermissionsChange = {
        scope: 'workspace',
        key: 'admin', // locked role
        version: 1,
        permissions: ['workspace.settings.view'],
      };

      await expect(
        service.updateRolePermissions('actor-uuid-1', [lockedRoleChange], 'req-123'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
      });

      expect(applyChangesMock).toHaveBeenCalledTimes(1);
    });

    it('throws CONFLICT when repository plan returns conflict status', async () => {
      const { service, repository } = setup();

      vi.spyOn(repository, 'applyChanges').mockResolvedValueOnce({
        status: 'conflict',
      });

      const change: RolePermissionsChange = {
        scope: 'workspace',
        key: 'member',
        version: 99,
        permissions: ['workspace.settings.view'],
      };

      await expect(
        service.updateRolePermissions('actor-uuid-1', [change], 'req-123'),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: 'ROLE_PERMISSIONS_CHANGED',
      });
    });
  });
});
