import type { ProjectAccess } from '@repo/contracts';
import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { FakeProjectAccessResolver } from '../../../test/fakes/projectsFakes.js';
import { User } from '../../auth/entities/user.entity.js';
import { WorkspaceMember } from '../../workspaces/entities/workspaceMember.entity.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import {
  lockProjectForActor,
  type LockProjectForActorOptions,
} from './lockProjectForActor.js';

describe('lockProjectForActor', () => {
  const defaultOptions: LockProjectForActorOptions = {
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    actorId: 'user-1',
    projectLock: 'for_no_key_update',
  };

  function createMockManager(entities: {
    project?: Project | null;
    workspaceMember?: WorkspaceMember | null;
    projectMember?: ProjectMember | null;
    actor?: User | null;
  }) {
    const findOne = vi.fn().mockImplementation((entityClass: unknown) => {
      if (entityClass === Project)
        return Promise.resolve(entities.project ?? null);
      if (entityClass === WorkspaceMember)
        return Promise.resolve(entities.workspaceMember ?? null);
      if (entityClass === ProjectMember)
        return Promise.resolve(entities.projectMember ?? null);
      if (entityClass === User) return Promise.resolve(entities.actor ?? null);
      return Promise.resolve(null);
    });

    const manager = { findOne } as unknown as EntityManager;
    return { manager, findOne };
  }

  it('returns project_gone when project is not found or soft-deleted', async () => {
    const { manager, findOne } = createMockManager({ project: null });
    const resolver = new FakeProjectAccessResolver();

    const result = await lockProjectForActor(manager, resolver, defaultOptions);

    expect(result).toEqual({ kind: 'project_gone' });
    expect(findOne).toHaveBeenCalledWith(
      Project,
      expect.objectContaining({
        lock: { mode: 'for_no_key_update' },
      }),
    );
  });

  it('returns forbidden when workspace member is not found or inactive', async () => {
    const project = { id: 'proj-1', workspaceId: 'ws-1' } as Project;
    const { manager } = createMockManager({ project, workspaceMember: null });
    const resolver = new FakeProjectAccessResolver();

    const result = await lockProjectForActor(manager, resolver, defaultOptions);

    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns actor_inactive when actor user row is missing or inactive/masked', async () => {
    const project = { id: 'proj-1', workspaceId: 'ws-1' } as Project;
    const workspaceMember = {
      workspaceId: 'ws-1',
      memberId: 'user-1',
      role: 'member',
      isActive: true,
    } as WorkspaceMember;

    const { manager } = createMockManager({
      project,
      workspaceMember,
      actor: null,
    });
    const resolver = new FakeProjectAccessResolver();

    const result = await lockProjectForActor(manager, resolver, defaultOptions);

    expect(result).toEqual({ kind: 'actor_inactive' });
  });

  it('returns forbidden when resolver.forMembership returns null', async () => {
    const project = { id: 'proj-1', workspaceId: 'ws-1' } as Project;
    const workspaceMember = {
      workspaceId: 'ws-1',
      memberId: 'user-1',
      role: 'member',
      isActive: true,
    } as WorkspaceMember;
    const projectMember = {
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      memberId: 'user-1',
      role: 'viewer',
      isActive: true,
    } as ProjectMember;
    const actor = {
      id: 'user-1',
      isActive: true,
      maskedAt: null,
    } as User;

    const { manager } = createMockManager({
      project,
      workspaceMember,
      projectMember,
      actor,
    });
    const resolver = new FakeProjectAccessResolver();
    resolver.membershipAccess = null;

    const result = await lockProjectForActor(manager, resolver, defaultOptions);

    expect(result).toEqual({ kind: 'forbidden' });
    expect(resolver.lastMembership).toEqual({
      workspaceRole: 'member',
      assignedRole: 'viewer',
    });
  });

  it('returns ok with project and access when actor has membership and access', async () => {
    const project = { id: 'proj-1', workspaceId: 'ws-1' } as Project;
    const workspaceMember = {
      workspaceId: 'ws-1',
      memberId: 'user-1',
      role: 'member',
      isActive: true,
    } as WorkspaceMember;
    const projectMember = {
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      memberId: 'user-1',
      role: 'contributor',
      isActive: true,
    } as ProjectMember;
    const actor = {
      id: 'user-1',
      isActive: true,
      maskedAt: null,
    } as User;

    const access: ProjectAccess = {
      role: 'contributor',
      permissions: ['project.workitems.create'],
    };

    const { manager } = createMockManager({
      project,
      workspaceMember,
      projectMember,
      actor,
    });
    const resolver = new FakeProjectAccessResolver();
    resolver.membershipAccess = access;

    const result = await lockProjectForActor(manager, resolver, defaultOptions);

    expect(result).toEqual({ kind: 'ok', project, access });
    expect(resolver.lastMembership).toEqual({
      workspaceRole: 'member',
      assignedRole: 'contributor',
    });
  });

  it('returns ok for workspace admin without direct project membership', async () => {
    const project = { id: 'proj-1', workspaceId: 'ws-1' } as Project;
    const workspaceMember = {
      workspaceId: 'ws-1',
      memberId: 'admin-1',
      role: 'admin',
      isActive: true,
    } as WorkspaceMember;
    const actor = {
      id: 'admin-1',
      isActive: true,
      maskedAt: null,
    } as User;

    const access: ProjectAccess = {
      role: 'admin',
      permissions: ['project.workitems.create'],
    };

    const { manager, findOne } = createMockManager({
      project,
      workspaceMember,
      projectMember: null, // No explicit project_members row
      actor,
    });
    const resolver = new FakeProjectAccessResolver();
    resolver.membershipAccess = access;

    const result = await lockProjectForActor(manager, resolver, {
      ...defaultOptions,
      actorId: 'admin-1',
      projectLock: 'pessimistic_write',
    });

    expect(result).toEqual({ kind: 'ok', project, access });
    expect(resolver.lastMembership).toEqual({
      workspaceRole: 'admin',
      assignedRole: null,
    });
    expect(findOne).toHaveBeenCalledWith(
      Project,
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });
});
