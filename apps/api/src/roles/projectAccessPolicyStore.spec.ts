import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectAccessPolicyEntity } from './entities/projectAccessPolicy.entity.js';
import { TypeOrmProjectAccessPolicyStore } from './projectAccessPolicyStore.js';

const validRows: Partial<ProjectAccessPolicyEntity>[] = [
  {
    workspaceRoleScope: 'workspace',
    workspaceRole: 'admin',
    implicitProjectRole: 'admin',
    lowestAssignableRole: 'admin',
    highestAssignableRole: 'admin',
    overridesProjectRank: true,
  },
  {
    workspaceRoleScope: 'workspace',
    workspaceRole: 'member',
    implicitProjectRole: null,
    lowestAssignableRole: 'commenter',
    highestAssignableRole: 'admin',
    overridesProjectRank: false,
  },
  {
    workspaceRoleScope: 'workspace',
    workspaceRole: 'guest',
    implicitProjectRole: null,
    lowestAssignableRole: 'viewer',
    highestAssignableRole: 'viewer',
    overridesProjectRank: false,
  },
];

function createMockRepo(
  rows: Partial<ProjectAccessPolicyEntity>[],
): Repository<ProjectAccessPolicyEntity> {
  return {
    find: vi.fn().mockResolvedValue(rows),
  } as unknown as Repository<ProjectAccessPolicyEntity>;
}

describe('TypeOrmProjectAccessPolicyStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when policies() is called before onApplicationBootstrap()', () => {
    const repo = createMockRepo(validRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);
    expect(() => store.policies()).toThrow(
      'ProjectAccessPolicyStore used before bootstrap',
    );
  });

  it('loads valid policies successfully and freezes them', async () => {
    const repo = createMockRepo(validRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);

    await store.onApplicationBootstrap();

    const policies = store.policies();
    expect(policies.admin.implicitProjectRole).toBe('admin');
    expect(policies.admin.lowestAssignableRole).toBe('admin');
    expect(policies.admin.highestAssignableRole).toBe('admin');
    expect(policies.admin.overridesProjectRank).toBe(true);

    expect(policies.member.implicitProjectRole).toBeNull();
    expect(policies.member.lowestAssignableRole).toBe('commenter');
    expect(policies.member.highestAssignableRole).toBe('admin');
    expect(policies.member.overridesProjectRank).toBe(false);

    expect(policies.guest.implicitProjectRole).toBeNull();
    expect(policies.guest.lowestAssignableRole).toBe('viewer');
    expect(policies.guest.highestAssignableRole).toBe('viewer');
    expect(policies.guest.overridesProjectRank).toBe(false);

    expect(Object.isFrozen(policies)).toBe(true);
  });

  it('throws and logs when a workspace role policy is missing', async () => {
    const incompleteRows = validRows.filter((r) => r.workspaceRole !== 'guest');
    const repo = createMockRepo(incompleteRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(store.onApplicationBootstrap()).rejects.toThrow(
      'Invalid project_access_policies: Missing policy for workspace role: guest',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'project_access_policies.invalid reason=Missing policy for workspace role: guest',
    );
  });

  it('throws and logs when an unknown workspace role is present', async () => {
    const invalidRows = [
      ...validRows,
      {
        workspaceRoleScope: 'workspace' as const,
        workspaceRole: 'superuser',
        implicitProjectRole: null,
        lowestAssignableRole: 'viewer',
        highestAssignableRole: 'admin',
        overridesProjectRank: false,
      },
    ];
    const repo = createMockRepo(invalidRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(store.onApplicationBootstrap()).rejects.toThrow(
      'Invalid project_access_policies: Unknown workspace role: superuser',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'project_access_policies.invalid reason=Unknown workspace role: superuser',
    );
  });

  it('throws and logs when lowest assignable role is invalid', async () => {
    const invalidRows = validRows.map((r) =>
      r.workspaceRole === 'member'
        ? { ...r, lowestAssignableRole: 'nonexistent' }
        : r,
    );
    const repo = createMockRepo(invalidRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(store.onApplicationBootstrap()).rejects.toThrow(
      'Invalid project_access_policies: Unknown lowest assignable role: nonexistent',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'project_access_policies.invalid reason=Unknown lowest assignable role: nonexistent',
    );
  });

  it('throws and logs when lowest rank is greater than highest rank', async () => {
    const invalidRows = validRows.map((r) =>
      r.workspaceRole === 'member'
        ? {
            ...r,
            lowestAssignableRole: 'admin',
            highestAssignableRole: 'viewer',
          }
        : r,
    );
    const repo = createMockRepo(invalidRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(store.onApplicationBootstrap()).rejects.toThrow(
      /Lowest assignable role \(admin\) cannot have higher rank than highest \(viewer\) for member/,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('project_access_policies.invalid reason='),
    );
  });

  it('throws and logs when implicit project role does not equal assignable bounds', async () => {
    const invalidRows = validRows.map((r) =>
      r.workspaceRole === 'admin'
        ? { ...r, lowestAssignableRole: 'commenter' }
        : r,
    );
    const repo = createMockRepo(invalidRows);
    const store = new TypeOrmProjectAccessPolicyStore(repo);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(store.onApplicationBootstrap()).rejects.toThrow(
      /Workspace role with implicit role \(admin\) must have lowest and highest role equal to implicit role/,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('project_access_policies.invalid reason='),
    );
  });
});
