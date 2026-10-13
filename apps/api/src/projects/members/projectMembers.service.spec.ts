import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_MESSAGES,
  PROJECT_ERROR_MESSAGES,
  PROJECT_MEMBER_NOT_ADDABLE_MESSAGES,
  PROJECT_ROLE_CHANGE_MESSAGES,
  type ProjectListItem,
  type WorkspaceRole,
} from '@repo/contracts';
import { FakeClock } from '../../../test/fakes/authFakes.js';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { FakeProjectEvents } from '../../../test/fakes/projectsFakes.js';
import type { ProjectsService } from '../projects.service.js';
import type {
  AddProjectMembersInput,
  AddProjectMembersResult,
  ChangeProjectRoleInput,
  ChangeProjectRoleResult,
  ListInheritedProjectMembersOpts,
  ListProjectMembersOpts,
  ProjectMemberCandidateDbRow,
  ProjectMembersRepository,
  SearchProjectMemberCandidatesInput,
} from './projectMembers.repository.js';
import type {
  InheritedMemberDbRow,
  ProjectMemberDbRow,
} from './dto/projectMemberResponse.js';
import { FakeProjectAccessPolicyStore } from '../../../test/fakes/rolesFakes.js';
import { ProjectMembersService } from './projectMembers.service.js';

class FakeProjectMembersRepository implements ProjectMembersRepository {
  public rows: ProjectMemberDbRow[] = [];
  public candidateRows: ProjectMemberCandidateDbRow[] = [];
  public total = 0;
  public inheritedRows: InheritedMemberDbRow[] = [];
  public inheritedTotal = 0;
  public lastOpts?: ListProjectMembersOpts;
  public lastInheritedOpts?: ListInheritedProjectMembersOpts;
  public lastSearchInput?: SearchProjectMemberCandidatesInput;
  public addResult?: AddProjectMembersResult;
  public lastAddInput?: AddProjectMembersInput;
  public changeRoleResult?: ChangeProjectRoleResult;
  public lastChangeRoleInput?: ChangeProjectRoleInput;
  public assignedAdminCount = 1;

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

  async listInherited(
    _workspaceId: string,
    opts: ListInheritedProjectMembersOpts,
  ): Promise<{ members: InheritedMemberDbRow[]; total: number }> {
    this.lastInheritedOpts = opts;
    return {
      members: this.inheritedRows.slice(0, opts.limit),
      total: this.inheritedTotal || this.inheritedRows.length,
    };
  }

  async countAssignedAdmins(
    _projectId: string,
    _implicitRoles: readonly WorkspaceRole[],
  ): Promise<number> {
    return this.assignedAdminCount;
  }

  async searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]> {
    this.lastSearchInput = input;
    return this.candidateRows;
  }

  async addMembers(
    input: AddProjectMembersInput,
  ): Promise<AddProjectMembersResult> {
    this.lastAddInput = input;
    return (
      this.addResult ?? {
        status: 'added',
        members: input.members.map((m) => ({
          userId: m.userId,
          firstName: 'User',
          lastName: m.userId,
          displayName: `User ${m.userId}`,
          avatarUrl: null,
          email: input.includeEmail ? `${m.userId}@example.com` : null,
          assignedRole: m.role,
          workspaceRole: 'member',
          joinedAt: input.now,
          accountActive: true,
        })),
        reactivatedCount: 0,
        assignedAdminCount: this.assignedAdminCount,
      }
    );
  }

  async changeRole(
    input: ChangeProjectRoleInput,
  ): Promise<ChangeProjectRoleResult> {
    this.lastChangeRoleInput = input;
    return (
      this.changeRoleResult ?? {
        status: 'success',
        member: {
          userId: input.targetUserId,
          firstName: 'Target',
          lastName: 'User',
          displayName: 'Target User',
          avatarUrl: null,
          email: input.includeEmail ? 'target@example.com' : null,
          assignedRole: input.toRole,
          workspaceRole: 'member',
          joinedAt: input.now,
          accountActive: true,
        },
        fromRole: input.fromRole,
        toRole: input.toRole,
        assignedAdminCount: this.assignedAdminCount,
      }
    );
  }
}

describe('ProjectMembersService', () => {
  let service: ProjectMembersService;
  let repo: FakeProjectMembersRepository;
  let events: FakeProjectEvents;
  let clock: FakeClock;
  let fakeProjectsService: ProjectsService;

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

  const fakeProjectListItem: ProjectListItem = {
    id: project.project.id,
    name: project.project.name,
    identifier: project.project.identifier,
    description: project.project.description ?? '',
    icon: { name: project.project.iconName, color: project.project.iconColor },
    coverKey: project.project.coverKey ?? '',
    createdAt: project.project.createdAt.toISOString(),
    updatedAt: project.project.updatedAt.toISOString(),
    timezone: project.project.timezone,
    effectiveTimezone: 'UTC',
    role: 'admin',
    permissions: ['project.members.manage'],
    memberCount: 3,
    members: [],
  };

  beforeEach(() => {
    repo = new FakeProjectMembersRepository();
    events = new FakeProjectEvents();
    clock = new FakeClock(new Date('2026-10-10T12:00:00.000Z'));
    fakeProjectsService = {
      get: async () => ({ project: fakeProjectListItem }),
    } as unknown as ProjectsService;
    service = new ProjectMembersService(
      repo,
      events,
      fakeProjectsService,
      clock,
      new FakeProjectAccessPolicyStore(),
    );
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
        workspaceRole: 'guest', // guest ceiling is viewer -> clamped!
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
      role: 'viewer',
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
      'viewer',
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
      source: 'assigned',
      requestId: 'req-123',
    });
  });

  it('AC-10: combines inherited and assigned members, assigns correct source, nullable fields, and totals', async () => {
    repo.rows = [
      {
        userId: 'u-assigned-1',
        firstName: 'Bao',
        lastName: 'Le',
        displayName: 'Bao Le',
        avatarUrl: null,
        email: 'bao@example.com',
        assignedRole: 'contributor',
        workspaceRole: 'member',
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
      {
        userId: 'u-assigned-2',
        firstName: 'Chi',
        lastName: 'Tran',
        displayName: 'Chi Tran',
        avatarUrl: null,
        email: 'chi@example.com',
        assignedRole: 'commenter',
        workspaceRole: 'member',
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
    ];
    repo.total = 2;

    repo.inheritedRows = [
      {
        userId: 'u-admin-1',
        firstName: 'An',
        lastName: 'Vu',
        displayName: 'An Vu',
        avatarUrl: null,
        email: 'an@example.com',
        workspaceRole: 'admin',
        accountActive: true,
      },
      {
        userId: 'u-admin-2',
        firstName: 'Dung',
        lastName: 'Pham',
        displayName: 'Dung Pham',
        avatarUrl: null,
        email: 'dung@example.com',
        workspaceRole: 'admin',
        accountActive: false, // deactivated account
      },
      {
        userId: 'u-admin-3',
        firstName: 'Giang',
        lastName: 'Hoang',
        displayName: 'Giang Hoang',
        avatarUrl: null,
        email: 'giang@example.com',
        workspaceRole: 'admin',
        accountActive: true,
      },
    ];
    repo.inheritedTotal = 3;

    const res = await service.list(workspace, project, 'actor-1');

    expect(res.total).toBe(5);
    expect(res.members).toHaveLength(5);

    // 3 inherited members have role 'admin', assignedRole null, joinedAt null, source 'inherited'
    const inherited = res.members.filter((m) => m.source === 'inherited');
    expect(inherited).toHaveLength(3);
    for (const m of inherited) {
      expect(m.role).toBe('admin');
      expect(m.assignedRole).toBeNull();
      expect(m.joinedAt).toBeNull();
      expect(m.roleLimited).toBe(false);
      expect(m.workspaceRole).toBe('admin');
    }

    const deactivated = res.members.find((m) => m.userId === 'u-admin-2');
    expect(deactivated?.accountActive).toBe(false);

    // 2 assigned members have source 'assigned'
    const assigned = res.members.filter((m) => m.source === 'assigned');
    expect(assigned).toHaveLength(2);
    expect(assigned[0]?.source).toBe('assigned');
    expect(assigned[0]?.assignedRole).toBeDefined();
    expect(assigned[0]?.joinedAt).not.toBeNull();

    // Check order: role admin first (rank 40), then contributor (rank 30), then commenter (rank 20)
    expect(res.members.map((m) => m.role)).toEqual([
      'admin',
      'admin',
      'admin',
      'contributor',
      'commenter',
    ]);
  });

  it('AC-23: omits inherited members when viewer lacks workspace.members.view permission', async () => {
    repo.rows = [
      {
        userId: 'u-assigned-1',
        firstName: 'Bao',
        lastName: 'Le',
        displayName: 'Bao Le',
        avatarUrl: null,
        email: 'bao@example.com',
        assignedRole: 'contributor',
        workspaceRole: 'member',
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
    ];
    repo.total = 1;

    repo.inheritedRows = [
      {
        userId: 'u-admin-1',
        firstName: 'An',
        lastName: 'Vu',
        displayName: 'An Vu',
        avatarUrl: null,
        email: 'an@example.com',
        workspaceRole: 'admin',
        accountActive: true,
      },
    ];
    repo.inheritedTotal = 1;

    const wsNoMembersView: MemberWorkspace = {
      ...workspace,
      permissions: [], // lacks workspace.members.view
    };

    const res = await service.list(wsNoMembersView, project, 'actor-1');

    expect(res.total).toBe(1);
    expect(res.members).toHaveLength(1);
    expect(res.members[0]?.userId).toBe('u-assigned-1');
    expect(res.members[0]?.source).toBe('assigned');
  });

  it('logs project.members.out_of_range warning when assigned members have out-of-range roles', async () => {
    const warnSpy = vi.spyOn(service['logger'], 'warn');

    repo.rows = [
      {
        userId: 'u-1',
        firstName: 'Guest',
        lastName: 'User',
        displayName: 'Guest User',
        avatarUrl: null,
        email: 'guest@example.com',
        assignedRole: 'contributor', // guest assigned contributor is out of range!
        workspaceRole: 'guest',
        joinedAt: new Date('2026-10-10T00:00:00Z'),
        accountActive: true,
      },
    ];

    await service.list(workspace, project, 'actor-1');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'project.members.out_of_range projectId=proj-1 count=1',
      ),
    );
  });

  it('returns assignedAdminCount from repository in list', async () => {
    repo.assignedAdminCount = 3;
    const res = await service.list(workspace, project, 'actor-1');
    expect(res.assignedAdminCount).toBe(3);
  });

  describe('assignableRoles in list', () => {
    it('sets assignableRoles to [] for actor self-row', async () => {
      repo.rows = [
        {
          userId: 'actor-1',
          firstName: 'Actor',
          lastName: 'Self',
          displayName: 'Actor Self',
          avatarUrl: null,
          email: 'actor@example.com',
          assignedRole: 'admin',
          workspaceRole: 'member',
          joinedAt: new Date('2026-10-10T00:00:00Z'),
          accountActive: true,
        },
      ];

      const res = await service.list(workspace, project, 'actor-1');
      expect(res.members[0]!.assignableRoles).toEqual([]);
    });

    it('sets assignableRoles to [] for inherited rows', async () => {
      repo.inheritedRows = [
        {
          userId: 'u-admin-1',
          firstName: 'Inherited',
          lastName: 'Admin',
          displayName: 'Inherited Admin',
          avatarUrl: null,
          email: 'admin@example.com',
          workspaceRole: 'admin',
          accountActive: true,
        },
      ];

      const res = await service.list(workspace, project, 'actor-1');
      const inherited = res.members.find((m) => m.source === 'inherited');
      expect(inherited?.assignableRoles).toEqual([]);
    });

    it('sets assignableRoles to [] when actor lacks project.members.manage', async () => {
      repo.rows = [
        {
          userId: 'u-target',
          firstName: 'Target',
          lastName: 'User',
          displayName: 'Target User',
          avatarUrl: null,
          email: 'target@example.com',
          assignedRole: 'commenter',
          workspaceRole: 'member',
          joinedAt: new Date('2026-10-10T00:00:00Z'),
          accountActive: true,
        },
      ];
      const projNoManage: AccessibleProject = {
        ...project,
        access: {
          role: 'admin',
          permissions: ['project.members.view'],
        },
      };

      const res = await service.list(workspace, projNoManage, 'actor-1');
      expect(res.members[0]!.assignableRoles).toEqual([]);
    });

    it('calculates assignableRoles according to RP B8.2 for peer and subordinate roles', async () => {
      repo.rows = [
        {
          userId: 'u-admin-peer',
          firstName: 'Peer',
          lastName: 'Admin',
          displayName: 'Peer Admin',
          avatarUrl: null,
          email: 'peer@example.com',
          assignedRole: 'admin',
          workspaceRole: 'member',
          joinedAt: new Date('2026-10-10T00:00:00Z'),
          accountActive: true,
        },
        {
          userId: 'u-contributor',
          firstName: 'Sub',
          lastName: 'Contributor',
          displayName: 'Sub Contributor',
          avatarUrl: null,
          email: 'sub@example.com',
          assignedRole: 'contributor',
          workspaceRole: 'member',
          joinedAt: new Date('2026-10-10T00:00:00Z'),
          accountActive: true,
        },
        {
          userId: 'u-guest',
          firstName: 'Guest',
          lastName: 'User',
          displayName: 'Guest User',
          avatarUrl: null,
          email: 'guest@example.com',
          assignedRole: 'viewer',
          workspaceRole: 'guest',
          joinedAt: new Date('2026-10-10T00:00:00Z'),
          accountActive: true,
        },
      ];

      // Actor is member workspace, admin in project
      const res = await service.list(workspace, project, 'actor-1');
      const peer = res.members.find((m) => m.userId === 'u-admin-peer');
      const sub = res.members.find((m) => m.userId === 'u-contributor');
      const guest = res.members.find((m) => m.userId === 'u-guest');

      // Actor is not overridesProjectRank, so peer admin has rank >= actor -> []
      expect(peer?.assignableRoles).toEqual([]);
      // Subordinate member: up to actor role ('admin') within member allowable roles -> ['admin', 'contributor', 'commenter']
      expect(sub?.assignableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);
      // Guest: bounded by guest policy -> ['viewer']
      expect(guest?.assignableRoles).toEqual(['viewer']);

      // Workspace Admin actor has overridesProjectRank: can assign peer admin
      const wsAdmin: MemberWorkspace = {
        ...workspace,
        role: 'admin',
      };
      const resWsAdmin = await service.list(wsAdmin, project, 'actor-ws-admin');
      const peerAsWsAdmin = resWsAdmin.members.find(
        (m) => m.userId === 'u-admin-peer',
      );
      expect(peerAsWsAdmin?.assignableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);
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
        addableRoles: ['admin', 'contributor', 'commenter'],
        workspaceRole: 'member',
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
      expect(res.candidates[0]!.addableRoles).toEqual(['viewer']);
    });
  });

  describe('add', () => {
    it('rejects duplicate member rows with 400 VALIDATION_ERROR', async () => {
      await expect(
        service.add(
          workspace,
          project,
          'actor-admin',
          {
            members: [
              { userId: 'u-1', role: 'contributor' },
              { userId: 'u-1', role: 'viewer' },
            ],
          },
          'req-1',
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: MEMBER_MESSAGES.checkFields,
        fields: {
          'members.1.userId': MEMBER_MESSAGES.rowDuplicate,
        },
      });
    });

    it('rejects role outside actor addableProjectRoleRange with 403 and records addRoleForbidden event', async () => {
      // Contributor actor with manage permission cannot assign admin
      const contributorProject: AccessibleProject = {
        ...project,
        access: {
          role: 'contributor',
          permissions: ['project.members.manage', 'project.members.view'],
        },
      };

      await expect(
        service.add(
          workspace,
          contributorProject,
          'actor-contributor',
          {
            members: [{ userId: 'u-1', role: 'admin' }],
          },
          'req-forbidden-role',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: MEMBER_MESSAGES.roleNotAllowed,
      });

      expect(events.addRoleForbiddenEvents).toHaveLength(1);
      expect(events.addRoleForbiddenEvents[0]).toEqual({
        projectId: 'proj-1',
        actorId: 'actor-contributor',
        requestId: 'req-forbidden-role',
      });
    });

    it('adds members, includes email when permitted, logs membersAdded, and returns project from projectsService.get', async () => {
      const res = await service.add(
        workspace,
        project,
        'actor-admin',
        {
          members: [
            { userId: 'u-1', role: 'contributor' },
            { userId: 'u-2', role: 'viewer' },
          ],
        },
        'req-add-success',
      );

      expect(res.members).toHaveLength(2);
      expect(res.assignedAdminCount).toBe(1);
      expect(res.members[0]).toMatchObject({
        userId: 'u-1',
        email: 'u-1@example.com',
        role: 'contributor',
        assignedRole: 'contributor',
        assignableRoles: ['admin', 'contributor', 'commenter'],
      });
      expect(res.project).toEqual(fakeProjectListItem);
      expect(events.membersAddedEvents).toHaveLength(1);
      expect(events.membersAddedEvents[0]).toMatchObject({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        actorId: 'actor-admin',
        actorRole: 'admin',
        count: 2,
        roles: ['contributor', 'viewer'],
        requestId: 'req-add-success',
      });
    });

    it('omits email from response members when workspace lacks email.view', async () => {
      const noEmailWorkspace: MemberWorkspace = {
        ...workspace,
        permissions: ['workspace.members.view'],
      };

      const res = await service.add(
        noEmailWorkspace,
        project,
        'actor-admin',
        {
          members: [{ userId: 'u-1', role: 'contributor' }],
        },
        'req-no-email',
      );

      expect(res.members[0]!.email).toBeUndefined();
    });

    it('maps project_gone to 404 PROJECT_NOT_FOUND', async () => {
      repo.addResult = { status: 'project_gone' };

      await expect(
        service.add(
          workspace,
          project,
          'actor-admin',
          { members: [{ userId: 'u-1', role: 'contributor' }] },
          'req-gone',
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
        message: PROJECT_ERROR_MESSAGES.notFound,
      });
    });

    it('maps actor_forbidden to 403 FORBIDDEN', async () => {
      repo.addResult = { status: 'actor_forbidden' };

      await expect(
        service.add(
          workspace,
          project,
          'actor-admin',
          { members: [{ userId: 'u-1', role: 'contributor' }] },
          'req-actor-forbidden',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: MEMBER_MESSAGES.notAllowed,
      });
    });

    it('maps role_forbidden inside transaction to 403 and records addRoleForbidden event', async () => {
      repo.addResult = { status: 'role_forbidden' };

      await expect(
        service.add(
          workspace,
          project,
          'actor-admin',
          { members: [{ userId: 'u-1', role: 'contributor' }] },
          'req-tx-role-forbidden',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: MEMBER_MESSAGES.roleNotAllowed,
      });

      expect(events.addRoleForbiddenEvents).toHaveLength(1);
    });

    it('maps rejected row errors with field mapping for userId and role', async () => {
      repo.addResult = {
        status: 'rejected',
        rows: [
          { index: 0, reason: 'not_in_workspace' },
          { index: 1, reason: 'role_not_allowed' },
        ],
      };

      await expect(
        service.add(
          workspace,
          project,
          'actor-admin',
          {
            members: [
              { userId: 'u-1', role: 'contributor' },
              { userId: 'u-2', role: 'admin' },
            ],
          },
          'req-rejected',
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: 'MEMBERS_NOT_ADDABLE',
        message: MEMBER_MESSAGES.someNotAdded,
        fields: {
          'members.0.userId':
            PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.not_in_workspace,
          'members.1.role':
            PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed,
        },
      });
    });

    it('maps role_unknown to 400 VALIDATION_ERROR on every row role', async () => {
      repo.addResult = { status: 'role_unknown' };

      await expect(
        service.add(
          workspace,
          project,
          'actor-admin',
          {
            members: [
              { userId: 'u-1', role: 'contributor' },
              { userId: 'u-2', role: 'commenter' },
            ],
          },
          'req-role-unknown',
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: MEMBER_MESSAGES.checkFields,
        fields: {
          'members.0.role': MEMBER_MESSAGES.chooseRole,
          'members.1.role': MEMBER_MESSAGES.chooseRole,
        },
      });
    });
  });

  describe('add row rule (rowRejection given to the repository)', () => {
    async function rowRejectionOf() {
      await service.add(
        workspace,
        project,
        'actor-admin',
        { members: [{ userId: 'u-1', role: 'contributor' }] },
        'req-row-rule',
      );
      const input = repo.lastAddInput!;
      const context = {
        actor: {
          userId: 'actor-admin',
          workspaceRole: workspace.role,
          effectiveRole: project.access.role,
          permissions: project.access.permissions,
        },
        projectPermissions: project.access.permissions,
        workspacePermissions: workspace.permissions,
      };
      return (
        target: {
          workspaceRole: MemberWorkspace['role'];
          alreadyMember: boolean;
        },
        role: Parameters<AddProjectMembersInput['rowRejection']>[2],
      ) => input.rowRejection(context, { userId: 'u-9', ...target }, role);
    }

    it('rejects a workspace role with implicit project access before checking membership', async () => {
      const reject = await rowRejectionOf();
      expect(
        reject({ workspaceRole: 'admin', alreadyMember: true }, 'contributor'),
      ).toBe('workspace_admin');
    });

    it('rejects someone who is already an active member', async () => {
      const reject = await rowRejectionOf();
      expect(
        reject({ workspaceRole: 'member', alreadyMember: true }, 'contributor'),
      ).toBe('already_member');
    });

    it('rejects a role above what the target workspace role allows', async () => {
      const reject = await rowRejectionOf();
      expect(
        reject({ workspaceRole: 'guest', alreadyMember: false }, 'admin'),
      ).toBe('role_not_allowed');
    });

    it('accepts an addable workspace member with an allowed role', async () => {
      const reject = await rowRejectionOf();
      expect(
        reject(
          { workspaceRole: 'member', alreadyMember: false },
          'contributor',
        ),
      ).toBeNull();
    });
  });

  describe('changeRole', () => {
    it('throws 404 PROJECT_NOT_FOUND when project is gone', async () => {
      repo.changeRoleResult = { status: 'project_gone' };
      await expect(
        service.changeRole(workspace, project, 'actor-1', 'target-1', {
          fromRole: 'commenter',
          role: 'contributor',
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
        message: PROJECT_ERROR_MESSAGES.notFound,
      });
    });

    it('throws 404 NOT_FOUND when target member is gone', async () => {
      repo.changeRoleResult = { status: 'member_gone' };
      await expect(
        service.changeRole(workspace, project, 'actor-1', 'target-1', {
          fromRole: 'commenter',
          role: 'contributor',
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
        message: PROJECT_ROLE_CHANGE_MESSAGES.memberGone,
      });
    });

    it('throws 403 FORBIDDEN and emits roleForbidden when actor is forbidden', async () => {
      repo.changeRoleResult = { status: 'actor_forbidden' };
      await expect(
        service.changeRole(
          workspace,
          project,
          'actor-1',
          'target-1',
          { fromRole: 'commenter', role: 'contributor' },
          'req-1',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: PROJECT_ROLE_CHANGE_MESSAGES.cantChange,
      });
      expect(events.roleForbiddenEvents).toHaveLength(1);
      expect(events.roleForbiddenEvents[0]).toMatchObject({
        projectId: 'proj-1',
        actorId: 'actor-1',
        targetId: 'target-1',
        requestId: 'req-1',
      });
    });

    it('throws 403 FORBIDDEN and emits roleForbidden when cant change target', async () => {
      repo.changeRoleResult = { status: 'cant_change' };
      await expect(
        service.changeRole(
          workspace,
          project,
          'actor-1',
          'target-1',
          { fromRole: 'commenter', role: 'contributor' },
          'req-2',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: PROJECT_ROLE_CHANGE_MESSAGES.cantChange,
      });
      expect(events.roleForbiddenEvents).toHaveLength(1);
    });

    it('throws 409 ROLE_INHERITED when target has implicit access', async () => {
      repo.changeRoleResult = { status: 'role_inherited' };
      await expect(
        service.changeRole(workspace, project, 'actor-1', 'target-1', {
          fromRole: 'commenter',
          role: 'contributor',
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'ROLE_INHERITED',
        message: PROJECT_ROLE_CHANGE_MESSAGES.inherited,
      });
    });

    it('throws 409 ROLE_CHANGED when fromRole does not match', async () => {
      repo.changeRoleResult = { status: 'role_changed' };
      await expect(
        service.changeRole(workspace, project, 'actor-1', 'target-1', {
          fromRole: 'commenter',
          role: 'contributor',
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'ROLE_CHANGED',
        message: MEMBER_MESSAGES.roleChanged,
      });
    });

    it('throws 400 ROLE_UNCHANGED when role is unchanged', async () => {
      repo.changeRoleResult = { status: 'role_unchanged' };
      await expect(
        service.changeRole(workspace, project, 'actor-1', 'target-1', {
          fromRole: 'commenter',
          role: 'commenter',
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'ROLE_UNCHANGED',
        message: MEMBER_MESSAGES.sameRole,
      });
    });

    it('throws 400 PROJECT_ROLE_NOT_ALLOWED when role is out of range for workspace role', async () => {
      repo.changeRoleResult = {
        status: 'role_not_allowed_for_workspace_role',
      };
      await expect(
        service.changeRole(workspace, project, 'actor-1', 'target-1', {
          fromRole: 'commenter',
          role: 'viewer',
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'PROJECT_ROLE_NOT_ALLOWED',
        message: MEMBER_MESSAGES.roleOutOfRange,
        fields: { role: MEMBER_MESSAGES.roleOutOfRange },
      });
      expect(events.roleChangedEvents).toHaveLength(0);
      expect(events.roleForbiddenEvents).toHaveLength(0);
    });

    it('throws 403 FORBIDDEN and emits roleForbidden when role is not allowed for actor (AC-08)', async () => {
      repo.changeRoleResult = { status: 'role_not_allowed' };
      await expect(
        service.changeRole(
          workspace,
          project,
          'actor-1',
          'target-1',
          { fromRole: 'commenter', role: 'admin' },
          'req-forbidden',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: MEMBER_MESSAGES.roleNotAllowed,
      });
      expect(events.roleForbiddenEvents).toHaveLength(1);
      expect(events.roleChangedEvents).toHaveLength(0);
    });

    it('succeeds: returns member and assignedAdminCount and emits roleChanged', async () => {
      repo.changeRoleResult = {
        status: 'success',
        member: {
          userId: 'target-1',
          firstName: 'An',
          lastName: 'Nguyen',
          displayName: 'an',
          avatarUrl: null,
          email: 'an@example.com',
          assignedRole: 'contributor',
          workspaceRole: 'member',
          joinedAt: new Date('2026-01-01'),
          accountActive: true,
        },
        fromRole: 'commenter',
        toRole: 'contributor',
        assignedAdminCount: 2,
      };

      const res = await service.changeRole(
        workspace,
        project,
        'actor-admin',
        'target-1',
        { fromRole: 'commenter', role: 'contributor' },
        'req-ok',
      );

      expect(res.assignedAdminCount).toBe(2);
      expect(res.member).toMatchObject({
        userId: 'target-1',
        role: 'contributor',
        assignedRole: 'contributor',
        source: 'assigned',
      });
      expect(events.roleChangedEvents).toHaveLength(1);
      expect(events.roleChangedEvents[0]).toMatchObject({
        projectId: 'proj-1',
        actorId: 'actor-admin',
        targetId: 'target-1',
        fromRole: 'commenter',
        toRole: 'contributor',
        requestId: 'req-ok',
      });
    });
  });
});
