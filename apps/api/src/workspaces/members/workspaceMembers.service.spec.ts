import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceMembersService } from './workspaceMembers.service.js';
import { FakeWorkspaceMembersRepository } from '../../../test/fakes/workspaceMembersFakes.js';

describe('WorkspaceMembersService', () => {
  let service: WorkspaceMembersService;
  let repo: FakeWorkspaceMembersRepository;

  beforeEach(() => {
    repo = new FakeWorkspaceMembersRepository();
    service = new WorkspaceMembersService(repo);
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
});

