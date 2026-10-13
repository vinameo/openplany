import { beforeEach, describe, expect, it } from 'vitest';
import {
  MEMBER_MESSAGES,
  PROJECT_ERROR_MESSAGES,
  PROJECT_MEMBER_NOT_ADDABLE_MESSAGES,
  type ProjectListItem,
} from '@repo/contracts';
import { FakeClock } from '../../../test/fakes/authFakes.js';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { FakeProjectEvents } from '../../../test/fakes/projectsFakes.js';
import type { ProjectsService } from '../projects.service.js';
import type {
  AddProjectMembersInput,
  AddProjectMembersResult,
  ListProjectMembersOpts,
  ProjectMemberCandidateDbRow,
  ProjectMembersRepository,
  SearchProjectMemberCandidatesInput,
} from './projectMembers.repository.js';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';
import { FakeProjectAccessPolicyStore } from '../../../test/fakes/rolesFakes.js';
import { ProjectMembersService } from './projectMembers.service.js';

class FakeProjectMembersRepository implements ProjectMembersRepository {
  public rows: ProjectMemberDbRow[] = [];
  public candidateRows: ProjectMemberCandidateDbRow[] = [];
  public total = 0;
  public lastOpts?: ListProjectMembersOpts;
  public lastSearchInput?: SearchProjectMemberCandidatesInput;
  public addResult?: AddProjectMembersResult;
  public lastAddInput?: AddProjectMembersInput;

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
        addableRoles: ['admin', 'contributor', 'commenter', 'viewer'],
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
      expect(res.members[0]).toMatchObject({
        userId: 'u-1',
        email: 'u-1@example.com',
        role: 'contributor',
        assignedRole: 'contributor',
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
});
