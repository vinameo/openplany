import { describe, expect, it, vi } from 'vitest';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import { WORKSPACE_ROLE_CHANGE_MESSAGES } from '@repo/contracts';
import {
  assertWorkspaceKeepsAdmin,
  LastAdminError,
} from './workspaceAdminGuard.js';
import { countActiveWorkspaceAdmins } from './workspaceFilters.js';
import { WorkspaceMember } from './entities/workspaceMember.entity.js';
import { User } from '../auth/entities/user.entity.js';

describe('workspaceAdminGuard & workspaceFilters', () => {
  function makeMockManager(countResult: number) {
    const innerJoin = vi.fn().mockReturnThis();
    const where = vi.fn().mockReturnThis();
    const andWhere = vi.fn().mockReturnThis();
    const getCount = vi.fn().mockResolvedValue(countResult);

    const qb = {
      innerJoin,
      where,
      andWhere,
      getCount,
    } as unknown as SelectQueryBuilder<WorkspaceMember>;

    const createQueryBuilder = vi.fn().mockReturnValue(qb);
    const manager = {
      createQueryBuilder,
    } as unknown as EntityManager;

    return {
      manager,
      createQueryBuilder,
      innerJoin,
      where,
      andWhere,
      getCount,
    };
  }

  describe('countActiveWorkspaceAdmins', () => {
    it('queries active workspace members with admin role and active user account', async () => {
      const {
        manager,
        createQueryBuilder,
        innerJoin,
        where,
        andWhere,
        getCount,
      } = makeMockManager(2);
      const result = await countActiveWorkspaceAdmins(manager, 'ws-1');

      expect(result).toBe(2);
      expect(createQueryBuilder).toHaveBeenCalledWith(WorkspaceMember, 'wm');
      expect(innerJoin).toHaveBeenCalledWith(User, 'u', 'u.id = wm.memberId');
      expect(where).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          isActive: true,
        }),
      );
      expect(andWhere).toHaveBeenCalledWith('u.isActive = :active', {
        active: true,
      });
      expect(getCount).toHaveBeenCalled();
    });

    it('excludes member when excludeMemberId option is given', async () => {
      const { manager, andWhere } = makeMockManager(1);
      const result = await countActiveWorkspaceAdmins(manager, 'ws-1', {
        excludeMemberId: 'mem-1',
      });

      expect(result).toBe(1);
      expect(andWhere).toHaveBeenCalledWith('wm.memberId <> :exclude', {
        exclude: 'mem-1',
      });
    });
  });

  describe('assertWorkspaceKeepsAdmin', () => {
    it('succeeds when at least one active admin remains', async () => {
      const { manager } = makeMockManager(1);

      await expect(
        assertWorkspaceKeepsAdmin(manager, 'ws-1', {
          excludeMemberId: 'target-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('throws LastAdminError when remaining active admin count is 0', async () => {
      const { manager } = makeMockManager(0);

      await expect(
        assertWorkspaceKeepsAdmin(manager, 'ws-1', {
          excludeMemberId: 'target-1',
        }),
      ).rejects.toThrow(LastAdminError);

      await expect(
        assertWorkspaceKeepsAdmin(manager, 'ws-1', {
          excludeMemberId: 'target-1',
        }),
      ).rejects.toThrow(WORKSPACE_ROLE_CHANGE_MESSAGES.lastAdmin);
    });
  });
});
