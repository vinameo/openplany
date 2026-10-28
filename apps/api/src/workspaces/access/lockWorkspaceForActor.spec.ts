import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../../auth/entities/user.entity.js';
import { RolePermission } from '../../roles/entities/rolePermission.entity.js';
import { Workspace } from '../entities/workspace.entity.js';
import { WorkspaceMember } from '../entities/workspaceMember.entity.js';
import {
  lockWorkspaceForActor,
  type LockWorkspaceForActorOptions,
} from './lockWorkspaceForActor.js';

describe('lockWorkspaceForActor', () => {
  const defaultOptions: LockWorkspaceForActorOptions = {
    workspaceId: 'ws-1',
    actorId: 'user-1',
  };

  function createMockManager(entities: {
    workspace?: Workspace | null;
    member?: WorkspaceMember | null;
    actor?: User | null;
    rolePermissions?: RolePermission[];
  }) {
    const findOne = vi.fn().mockImplementation((entityClass: unknown) => {
      if (entityClass === Workspace)
        return Promise.resolve(entities.workspace ?? null);
      if (entityClass === WorkspaceMember)
        return Promise.resolve(entities.member ?? null);
      if (entityClass === User) return Promise.resolve(entities.actor ?? null);
      return Promise.resolve(null);
    });

    const find = vi.fn().mockImplementation((entityClass: unknown) => {
      if (entityClass === RolePermission) {
        return Promise.resolve(entities.rolePermissions ?? []);
      }
      return Promise.resolve([]);
    });

    const manager = { findOne, find } as unknown as EntityManager;
    return { manager, findOne, find };
  }

  it('returns workspace_gone when workspace is not found or soft-deleted', async () => {
    const { manager, findOne } = createMockManager({ workspace: null });

    const result = await lockWorkspaceForActor(manager, defaultOptions);

    expect(result).toEqual({ kind: 'workspace_gone' });
    expect(findOne).toHaveBeenCalledWith(
      Workspace,
      expect.objectContaining({
        lock: { mode: 'pessimistic_read' },
      }),
    );
  });

  it('returns forbidden when workspace member is not found or inactive', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const { manager } = createMockManager({ workspace, member: null });

    const result = await lockWorkspaceForActor(manager, defaultOptions);

    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns actor_inactive when actor user row is missing or inactive/masked', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const member = {
      workspaceId: 'ws-1',
      memberId: 'user-1',
      role: 'member',
      isActive: true,
    } as WorkspaceMember;

    const { manager } = createMockManager({
      workspace,
      member,
      actor: null,
    });

    const result = await lockWorkspaceForActor(manager, defaultOptions);

    expect(result).toEqual({ kind: 'actor_inactive' });
  });

  it('returns forbidden when requiredPermission is not granted to actor role', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const member = {
      workspaceId: 'ws-1',
      memberId: 'user-1',
      role: 'member',
      isActive: true,
    } as WorkspaceMember;
    const actor = {
      id: 'user-1',
      isActive: true,
      maskedAt: null,
    } as User;

    const { manager } = createMockManager({
      workspace,
      member,
      actor,
      rolePermissions: [
        {
          scope: 'workspace',
          roleKey: 'member',
          permissionKey: 'workspace.members.view',
        } as RolePermission,
      ],
    });

    const result = await lockWorkspaceForActor(manager, {
      ...defaultOptions,
      requiredPermission: 'workspace.settings.update',
    });

    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns ok with workspace, member, and permissions when actor has valid access', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const member = {
      workspaceId: 'ws-1',
      memberId: 'user-1',
      role: 'admin',
      isActive: true,
    } as WorkspaceMember;
    const actor = {
      id: 'user-1',
      isActive: true,
      maskedAt: null,
    } as User;

    const { manager } = createMockManager({
      workspace,
      member,
      actor,
      rolePermissions: [
        {
          scope: 'workspace',
          roleKey: 'admin',
          permissionKey: 'workspace.settings.update',
        } as RolePermission,
      ],
    });

    const result = await lockWorkspaceForActor(manager, {
      ...defaultOptions,
      requiredPermission: 'workspace.settings.update',
    });

    expect(result).toEqual({
      kind: 'ok',
      workspace,
      member,
      permissions: ['workspace.settings.update'],
    });
  });
});

