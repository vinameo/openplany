import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { FakeProjectEvents } from '../../../test/fakes/projectsFakes.js';
import type {
  ListProjectMembersOpts,
  ProjectMemberCandidateDbRow,
  ProjectMembersRepository,
  SearchProjectMemberCandidatesInput,
} from './projectMembers.repository.js';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';
import { ProjectMembersService } from './projectMembers.service.js';

class FakeProjectMembersRepository implements ProjectMembersRepository {
  public rows: ProjectMemberDbRow[] = [];
  public candidateRows: ProjectMemberCandidateDbRow[] = [];
  public total = 0;
  public lastOpts?: ListProjectMembersOpts;
  public lastSearchInput?: SearchProjectMemberCandidatesInput;

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

  async searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]> {
    this.lastSearchInput = input;
    return this.candidateRows;
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

  describe('searchCandidates (API B4.2)', () => {
    it('uses contains mode and includes email when workspace viewer has email.view permission', async () => {
      repo.candidateRows = [
        {
          userId: 'u-1',
          firstName: 'An',
          lastName: 'Nguyen',
          displayName: 'An Nguyen',
          avatarUrl: null,
          email: 'an@openplany.dev',
          workspaceRole: 'member',
          alreadyMember: false,
        },
      ];

      const res = await service.searchCandidates(
        workspace,
        project,
        'actor-admin',
        'an',
        'req-search-1',
      );

      expect(repo.lastSearchInput).toEqual({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        query: 'an',
        mode: 'contains',
        limit: 10,
      });

      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0]).toEqual({
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        email: 'an@openplany.dev',
        avatarUrl: null,
        status: 'addable',
        addableRoles: ['admin', 'contributor', 'commenter', 'guest'],
      });

      expect(events.candidateSearchedEvents).toHaveLength(1);
      expect(events.candidateSearchedEvents[0]).toEqual({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        actorId: 'actor-admin',
        mode: 'contains',
        resultCount: 1,
        requestId: 'req-search-1',
      });
    });

    it('uses exact mode and sets email to query (including admin@localhost) when lacking email.view', async () => {
      const wsNoEmail: MemberWorkspace = {
        ...workspace,
        permissions: ['workspace.members.view'],
      };

      repo.candidateRows = [
        {
          userId: 'u-admin-cli',
          firstName: 'Admin',
          lastName: 'Local',
          displayName: 'Admin Local',
          avatarUrl: null,
          email: null, // exact mode does not select email
          workspaceRole: 'member',
          alreadyMember: false,
        },
      ];

      const res = await service.searchCandidates(
        wsNoEmail,
        project,
        'actor-admin',
        'admin@localhost',
      );

      expect(repo.lastSearchInput?.mode).toBe('exact');
      expect(res.candidates[0]!.email).toBe('admin@localhost');
      expect(events.candidateSearchedEvents[0]!.mode).toBe('exact');
    });

    it('prioritizes workspace_admin status when candidate has implicit project access', async () => {
      repo.candidateRows = [
        {
          userId: 'u-ws-admin',
          firstName: 'Kai',
          lastName: 'Tran',
          displayName: 'Kai Tran',
          avatarUrl: null,
          email: 'kai@openplany.dev',
          workspaceRole: 'admin', // implicit project access
          alreadyMember: true, // even if alreadyMember is true!
        },
      ];

      const res = await service.searchCandidates(
        workspace,
        project,
        'actor-admin',
        'kai',
      );

      expect(res.candidates[0]!.status).toBe('workspace_admin');
      expect(res.candidates[0]!.addableRoles).toEqual([]);
    });

    it('sets already_member status and empty addableRoles when candidate is already in project', async () => {
      repo.candidateRows = [
        {
          userId: 'u-already',
          firstName: 'Hoa',
          lastName: 'Le',
          displayName: 'Hoa Le',
          avatarUrl: null,
          email: 'hoa@openplany.dev',
          workspaceRole: 'member',
          alreadyMember: true,
        },
      ];

      const res = await service.searchCandidates(
        workspace,
        project,
        'actor-admin',
        'hoa',
      );

      expect(res.candidates[0]!.status).toBe('already_member');
      expect(res.candidates[0]!.addableRoles).toEqual([]);
    });

    it('clamps addableRoles for guest workspace member and does not hardcode role names', async () => {
      repo.candidateRows = [
        {
          userId: 'u-guest',
          firstName: 'Binh',
          lastName: 'Pham',
          displayName: 'Binh Pham',
          avatarUrl: null,
          email: 'binh@openplany.dev',
          workspaceRole: 'guest',
          alreadyMember: false,
        },
      ];

      const res = await service.searchCandidates(
        workspace,
        project,
        'actor-admin',
        'binh',
      );

      expect(res.candidates[0]!.status).toBe('addable');
      expect(res.candidates[0]!.addableRoles).toEqual(['guest']);
    });
  });
});

