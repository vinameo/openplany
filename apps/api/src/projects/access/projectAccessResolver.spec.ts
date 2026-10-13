import { Logger } from '@nestjs/common';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  type ProjectRole,
} from '@repo/contracts';
import { DEFAULT_PROJECT_ACCESS_POLICIES } from '@repo/contracts/testing';
import type { DataSource, EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectAccessPolicyStore } from '../../roles/projectAccessPolicyStore.js';
import { RolePermission } from '../../roles/entities/rolePermission.entity.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import {
  TypeOrmProjectAccessResolver,
  type ProjectViewer,
} from './projectAccessResolver.js';

describe('TypeOrmProjectAccessResolver', () => {
  let mockManager: Partial<EntityManager>;
  let mockDataSource: Partial<DataSource>;
  let mockPolicyStore: Partial<ProjectAccessPolicyStore>;
  let resolver: TypeOrmProjectAccessResolver;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    mockPolicyStore = {
      policies: () => DEFAULT_PROJECT_ACCESS_POLICIES,
    };

    mockManager = {};
    mockDataSource = {
      manager: mockManager as EntityManager,
    };

    resolver = new TypeOrmProjectAccessResolver(
      mockDataSource as DataSource,
      mockPolicyStore as ProjectAccessPolicyStore,
    );
  });

  function makeProject(id: string, identifier: string): Project {
    return {
      id,
      identifier,
      workspaceId: 'ws-1',
      name: `Project ${identifier}`,
      description: '',
      iconName: DEFAULT_PROJECT_ICON,
      iconColor: DEFAULT_PROJECT_ICON_COLOR,
      coverKey: DEFAULT_PROJECT_COVER,
      createdById: null,
      updatedById: null,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      timezone: null,
      isActive: true,
      deletedAt: null,
    } as unknown as Project;
  }

  function makeMember(projectId: string, memberId: string, role: ProjectRole): ProjectMember {
    return {
      projectId,
      memberId,
      workspaceId: 'ws-1',
      role,
      roleScope: 'project',
      isActive: true,
      joinedAt: new Date('2026-10-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    } as ProjectMember;
  }

  it('AC-07: forWorkspace counts out_of_range roles and logs exactly once (count=3)', async () => {
    const viewer: ProjectViewer = {
      workspaceId: 'ws-1',
      userId: 'u-1',
      workspaceRole: 'member',
    };

    const p1 = makeProject('p-1', 'PR1');
    const p2 = makeProject('p-2', 'PR2');
    const p3 = makeProject('p-3', 'PR3');

    // 3 projects with assigned role 'viewer' for workspace member (floor is commenter)
    const m1 = makeMember('p-1', 'u-1', 'viewer');
    const m2 = makeMember('p-2', 'u-1', 'viewer');
    const m3 = makeMember('p-3', 'u-1', 'viewer');

    mockManager.find = vi.fn().mockImplementation(async (entity: unknown) => {
      if (entity === ProjectMember) return [m1, m2, m3];
      if (entity === Project) return [p1, p2, p3];
      if (entity === RolePermission) {
        return [
          { scope: 'project', roleKey: 'viewer', permissionKey: 'project.workitems.view' },
        ];
      }
      return [];
    });

    const result = await resolver.forWorkspace(viewer);

    expect(result.projects).toHaveLength(3);
    expect(result.projects[0]!.access.role).toBe('viewer');
    expect(result.projects[1]!.access.role).toBe('viewer');
    expect(result.projects[2]!.access.role).toBe('viewer');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'project.role.out_of_range userId=u-1 workspaceRole=member count=3',
    );
  });

  it('forWorkspace does not emit warn log when roles are within range', async () => {
    const viewer: ProjectViewer = {
      workspaceId: 'ws-1',
      userId: 'u-1',
      workspaceRole: 'member',
    };

    const p1 = makeProject('p-1', 'PR1');
    const m1 = makeMember('p-1', 'u-1', 'contributor');

    mockManager.find = vi.fn().mockImplementation(async (entity: unknown) => {
      if (entity === ProjectMember) return [m1];
      if (entity === Project) return [p1];
      if (entity === RolePermission) return [];
      return [];
    });

    const result = await resolver.forWorkspace(viewer);

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]!.access.role).toBe('contributor');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('forProject logs count=1 and projectId when role is out of range', async () => {
    const viewer: ProjectViewer & { projectId: string } = {
      workspaceId: 'ws-1',
      userId: 'u-1',
      workspaceRole: 'member',
      projectId: 'p-1',
    };

    const p1 = makeProject('p-1', 'PR1');
    const m1 = makeMember('p-1', 'u-1', 'viewer');

    mockManager.find = vi.fn().mockImplementation(async (entity: unknown) => {
      if (entity === ProjectMember) return [m1];
      if (entity === RolePermission) return [];
      return [];
    });
    mockManager.findOne = vi.fn().mockResolvedValue(p1);

    const result = await resolver.forProject(viewer);

    expect(result).not.toBeNull();
    expect(result!.access.role).toBe('viewer');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'project.role.out_of_range userId=u-1 workspaceRole=member count=1 projectId=p-1',
    );
  });

  it('forIdentifier logs count=1 and projectId when role is out of range', async () => {
    const viewer: ProjectViewer & { identifier: string } = {
      workspaceId: 'ws-1',
      userId: 'u-1',
      workspaceRole: 'member',
      identifier: 'PR1',
    };

    const p1 = makeProject('p-1', 'PR1');
    const m1 = makeMember('p-1', 'u-1', 'viewer');

    mockManager.find = vi.fn().mockImplementation(async (entity: unknown) => {
      if (entity === ProjectMember) return [m1];
      if (entity === RolePermission) return [];
      return [];
    });
    mockManager.findOne = vi.fn().mockResolvedValue(p1);

    const result = await resolver.forIdentifier(viewer);

    expect(result.kind).toBe('accessible');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'project.role.out_of_range userId=u-1 workspaceRole=member count=1 projectId=p-1',
    );
  });
});
