import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { FakeProjectEvents } from '../../../test/fakes/projectsFakes.js';
import type {
  ListProjectMembersOpts,
  ProjectMembersRepository,
} from './projectMembers.repository.js';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';
import { ProjectMembersService } from './projectMembers.service.js';

class FakeProjectMembersRepository implements ProjectMembersRepository {
  public rows: ProjectMemberDbRow[] = [];
  public total = 0;
  public lastOpts?: ListProjectMembersOpts;

  async list(
    _projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }> {
    this.lastOpts = opts;
    return {
      members: this.rows.slice(0, opts.limit),
      total: this.total || this.rows.length,
    };
  }
}

describe('ProjectMembersService', () => {
  let service: ProjectMembersService;
  let repo: FakeProjectMembersRepository;
  let events: FakeProjectEvents;

  const workspace: MemberWorkspace = {
    id: 'ws-1',
    slug: 'ws-slug',
    name: 'Workspace',
    logo: null,
    backgroundColor: '#ffffff',
    organizationSize: '2-10',
    timezone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
    memberCount: 10,
    role: 'member',
    permissions: ['workspace.members.view', 'workspace.members.email.view'],
  };

  const project: AccessibleProject = {
    project: {
      id: 'proj-1',
      name: 'Project 1',
      identifier: 'P1',
      description: '',
      iconName: 'folder',
      iconColor: '#000000',
      coverKey: 'cover-1',
      timezone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    access: {
      role: 'admin',
      permissions: ['project.members.view', 'project.members.manage'],
    },
  };

  beforeEach(() => {
    repo = new FakeProjectMembersRepository();
    events = new FakeProjectEvents();
    service = new ProjectMembersService(repo, events);
  });

  it('lists members with effective role, roleLimited, and includes email when permitted', async () => {
    repo.rows = [
      {
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        avatarUrl: null,
        email: 'an@example.com',
        assignedRole: 'admin',
        workspaceRole: 'guest', // guest ceiling is guest -> clamped!
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
    ];

    const res = await service.list(workspace, project, 'actor-1');

    expect(res.total).toBe(1);
    expect(res.truncated).toBe(false);
    expect(res.members).toHaveLength(1);
    expect(res.members[0]).toMatchObject({
      userId: 'u-1',
      role: 'guest',
      assignedRole: 'admin',
      roleLimited: true,
      email: 'an@example.com',
      joinedAt: '2026-10-10T00:00:00.000Z',
      accountActive: true,
    });
    expect(res.addableRoles).toEqual([
      'admin',
      'contributor',
      'commenter',
      'guest',
    ]);
  });

  it('omits email when workspace viewer lacks workspace.members.email.view', async () => {
    repo.rows = [
      {
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        avatarUrl: null,
        email: 'an@example.com',
        assignedRole: 'contributor',
        workspaceRole: 'member',
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
    ];

    const wsNoEmail: MemberWorkspace = {
      ...workspace,
      permissions: ['workspace.members.view'],
    };

    const res = await service.list(wsNoEmail, project, 'actor-1');

    expect(res.members[0]!.email).toBeUndefined();
    expect(repo.lastOpts?.includeEmail).toBe(false);
  });

  it('sets addableRoles to [] when canAddProjectMembers is false', async () => {
    const projNoManage: AccessibleProject = {
      ...project,
      access: {
        role: 'contributor',
        permissions: ['project.members.view'], // lacks project.members.manage
      },
    };

    const res = await service.list(workspace, projNoManage, 'actor-1');
    expect(res.addableRoles).toEqual([]);
  });

  it('emits membersListTruncated event when total > members.length', async () => {
    repo.rows = [
      {
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        avatarUrl: null,
        email: 'an@example.com',
        assignedRole: 'contributor',
        workspaceRole: 'member',
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
    ];
    repo.total = 1500;

    const res = await service.list(workspace, project, 'actor-1', 'req-123');

    expect(res.truncated).toBe(true);
    expect(events.membersListTruncatedEvents).toHaveLength(1);
    expect(events.membersListTruncatedEvents[0]).toEqual({
      projectId: 'proj-1',
      total: 1500,
      requestId: 'req-123',
    });
  });
});
