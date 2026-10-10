import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceMembersService } from './workspaceMembers.service.js';
import { FakeWorkspaceMembersRepository } from '../../../test/fakes/workspaceMembersFakes.js';
import { FakeWorkspaceEvents } from '../../../test/fakes/workspacesFakes.js';
import { FakeClock } from '../../../test/fakes/authFakes.js';

describe('WorkspaceMembersService', () => {
  let service: WorkspaceMembersService;
  let repo: FakeWorkspaceMembersRepository;
  let events: FakeWorkspaceEvents;
  let clock: FakeClock;

  beforeEach(() => {
    repo = new FakeWorkspaceMembersRepository();
    events = new FakeWorkspaceEvents();
    clock = new FakeClock(new Date('2026-10-10T12:00:00.000Z'));
    service = new WorkspaceMembersService(repo, events, clock);
  });

  const baseWorkspace: MemberWorkspace = {
    id: 'ws-123',
    name: 'Acme',
    slug: 'acme',
    logo: null,
    backgroundColor: '#000',
    organizationSize: '2-10',
    timezone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: 'admin',
    permissions: ['workspace.members.view', 'workspace.members.email.view'],
    memberCount: 2,
  };

  it('includes email when actor has workspace.members.email.view permission', async () => {
    repo.membersByWorkspace.set('ws-123', [
      {
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        email: 'an@openplany.dev',
        avatarUrl: null,
        role: 'admin',
        joinedAt: new Date('2026-10-08T00:00:00Z'),
        accountActive: true,
      },
    ]);

    const result = await service.list(
      {
        ...baseWorkspace,
        permissions: ['workspace.members.view', 'workspace.members.email.view'],
      },
      'u-1',
      'req-1',
    );

    expect(result.members[0]).toHaveProperty('email', 'an@openplany.dev');
    expect(result.total).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('omits email key completely when actor lacks workspace.members.email.view', async () => {
    repo.membersByWorkspace.set('ws-123', [
      {
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        email: 'an@openplany.dev',
        avatarUrl: null,
        role: 'member',
        joinedAt: new Date('2026-10-08T00:00:00Z'),
        accountActive: true,
      },
    ]);

    const result = await service.list(
      {
        ...baseWorkspace,
        role: 'member',
        permissions: ['workspace.members.view'],
      },
      'u-1',
      'req-2',
    );

    expect(result.members[0]).not.toHaveProperty('email');
    expect('email' in result.members[0]!).toBe(false);
  });

  it('calculates addableRoles based on actor role and permissions', async () => {
    repo.membersByWorkspace.set('ws-123', []);

    // Admin actor with add permission
    const adminResult = await service.list(
      {
        ...baseWorkspace,
        role: 'admin',
        permissions: [
          'workspace.members.view',
          'workspace.members.email.view',
          'workspace.members.add',
        ],
      },
      'u-admin',
      'req-3',
    );
    expect(adminResult.addableRoles).toEqual(['admin', 'member', 'guest']);

    // Member actor without add permission
    const memberResult = await service.list(
      {
        ...baseWorkspace,
        role: 'member',
        permissions: ['workspace.members.view'],
      },
      'u-member',
      'req-4',
    );
    expect(memberResult.addableRoles).toEqual([]);
  });

  it('sets truncated=true and logs warning when total > members.length', async () => {
    repo.membersByWorkspace.set('ws-123', [
      {
        userId: 'u-1',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        email: 'an@openplany.dev',
        avatarUrl: null,
        role: 'admin',
        joinedAt: new Date('2026-10-08T00:00:00Z'),
        accountActive: true,
      },
    ]);
    repo.totalOverride = 1500;

    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const result = await service.list(baseWorkspace, 'u-1', 'req-trunc');

    expect(result.truncated).toBe(true);
    expect(result.total).toBe(1500);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('workspace.members.list.truncated workspaceId=ws-123 total=1500 requestId=req-trunc'),
    );

    warnSpy.mockRestore();
  });

  describe('searchCandidates', () => {
    it('normalizes query and calls repository, emitting candidateSearched event', async () => {
      repo.candidates = [
        {
          userId: 'u-cand-1',
          email: 'cand1@example.com',
          firstName: 'Cand',
          lastName: 'One',
          displayName: 'Cand One',
          avatarUrl: null,
          alreadyMember: false,
        },
      ];

      const res = await service.searchCandidates(
        baseWorkspace,
        'u-actor',
        '  Cand1@EXAMPLE.COM  ',
        'req-search-1',
      );

      expect(repo.lastSearchQuery).toBe('cand1@example.com');
      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0]).toEqual({
        userId: 'u-cand-1',
        email: 'cand1@example.com',
        firstName: 'Cand',
        lastName: 'One',
        displayName: 'Cand One',
        avatarUrl: null,
        alreadyMember: false,
      });

      expect(events.candidateSearchedEvents).toHaveLength(1);
      expect(events.candidateSearchedEvents[0]).toEqual({
        workspaceId: 'ws-123',
        actorId: 'u-actor',
        requestId: 'req-search-1',
        resultCount: 1,
      });
    });

    it('returns empty array when no candidates match', async () => {
      repo.candidates = [];

      const res = await service.searchCandidates(
        baseWorkspace,
        'u-actor',
        'nomatch@example.com',
        'req-empty',
      );

      expect(res.candidates).toEqual([]);
      expect(events.candidateSearchedEvents).toHaveLength(1);
      expect(events.candidateSearchedEvents[0]!.resultCount).toBe(0);
    });
  });

  describe('add', () => {
    const adminWs: MemberWorkspace = {
      ...baseWorkspace,
      role: 'admin',
      permissions: [
        'workspace.members.view',
        'workspace.members.email.view',
        'workspace.members.add',
      ],
    };

    it('throws 400 VALIDATION_ERROR when request has duplicate userIds and does not call repository', async () => {
      const repoAddSpy = vi.spyOn(repo, 'addMembers');

      await expect(
        service.add(
          adminWs,
          'u-actor',
          {
            members: [
              { userId: 'u-1', role: 'member' },
              { userId: 'u-1', role: 'guest' },
              { userId: 'u-2', role: 'member' },
              { userId: 'u-1', role: 'member' },
            ],
          },
          'req-dup',
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
        fields: {
          'members.1.userId': 'This person is already in another row',
          'members.3.userId': 'This person is already in another row',
        },
      });

      expect(repoAddSpy).not.toHaveBeenCalled();
    });

    it('throws 403 FORBIDDEN when assigning a role not in addableRoles and does not call repository', async () => {
      const repoAddSpy = vi.spyOn(repo, 'addMembers');

      // Actor is member (cannot assign admin)
      const memberWs: MemberWorkspace = {
        ...baseWorkspace,
        role: 'member',
        permissions: ['workspace.members.add'],
      };

      await expect(
        service.add(
          memberWs,
          'u-actor',
          {
            members: [{ userId: 'u-target', role: 'admin' }],
          },
          'req-forbid-role',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: "You can't assign this role",
      });

      expect(repoAddSpy).not.toHaveBeenCalled();
    });

    it('throws 409 MEMBERS_NOT_ADDABLE with fields by index when repository returns rejected', async () => {
      repo.addMembersResult = {
        status: 'rejected',
        rows: [
          { index: 0, reason: 'unavailable' },
          { index: 2, reason: 'already_member' },
        ],
      };

      await expect(
        service.add(
          adminWs,
          'u-actor',
          {
            members: [
              { userId: 'u-1', role: 'member' },
              { userId: 'u-2', role: 'member' },
              { userId: 'u-3', role: 'guest' },
            ],
          },
          'req-rej',
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: 'MEMBERS_NOT_ADDABLE',
        fields: {
          'members.0.userId':
            "This person can't be added. Their account may be deactivated.",
          'members.2.userId': 'Already a member of this workspace',
        },
      });
    });

    it('throws 403 FORBIDDEN when repository returns actor_forbidden', async () => {
      repo.addMembersResult = { status: 'actor_forbidden' };

      await expect(
        service.add(
          adminWs,
          'u-actor',
          { members: [{ userId: 'u-1', role: 'member' }] },
          'req-forbid',
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('throws 404 NOT_FOUND when repository returns workspace_gone', async () => {
      repo.addMembersResult = { status: 'workspace_gone' };

      await expect(
        service.add(
          adminWs,
          'u-actor',
          { members: [{ userId: 'u-1', role: 'member' }] },
          'req-gone',
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('adds members, emits membersAdded event, and includes email when actor has email view permission', async () => {
      repo.addMembersResult = {
        status: 'added',
        members: [
          {
            userId: 'u-1',
            firstName: 'Alice',
            lastName: 'Smith',
            displayName: 'Alice Smith',
            email: 'alice@example.com',
            avatarUrl: null,
            role: 'member',
            joinedAt: new Date('2026-10-10T12:00:00.000Z'),
            accountActive: true,
          },
        ],
        reactivatedCount: 1,
      };

      const result = await service.add(
        adminWs,
        'u-actor',
        { members: [{ userId: 'u-1', role: 'member' }] },
        'req-add-success',
      );

      expect(result.members).toHaveLength(1);
      expect(result.members[0]).toHaveProperty('email', 'alice@example.com');
      expect(result.members[0]!.userId).toBe('u-1');

      expect(events.membersAddedEvents).toHaveLength(1);
      expect(events.membersAddedEvents[0]).toEqual({
        workspaceId: 'ws-123',
        actorId: 'u-actor',
        actorRole: 'admin',
        requestId: 'req-add-success',
        occurredAt: new Date('2026-10-10T12:00:00.000Z'),
        count: 1,
        reactivatedCount: 1,
        roles: { member: 1 },
      });
    });

    it('omits email when actor lacks email view permission', async () => {
      repo.addMembersResult = {
        status: 'added',
        members: [
          {
            userId: 'u-1',
            firstName: 'Alice',
            lastName: 'Smith',
            displayName: 'Alice Smith',
            email: 'alice@example.com',
            avatarUrl: null,
            role: 'member',
            joinedAt: new Date('2026-10-10T12:00:00.000Z'),
            accountActive: true,
          },
        ],
        reactivatedCount: 0,
      };

      const wsWithoutEmail: MemberWorkspace = {
        ...adminWs,
        permissions: ['workspace.members.view', 'workspace.members.add'],
      };

      const result = await service.add(
        wsWithoutEmail,
        'u-actor',
        { members: [{ userId: 'u-1', role: 'member' }] },
        'req-no-email',
      );

      expect(result.members).toHaveLength(1);
      expect('email' in result.members[0]!).toBe(false);
    });
  });
});

