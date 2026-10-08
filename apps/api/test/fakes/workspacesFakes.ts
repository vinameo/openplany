import {
  SlugAlreadyExistsError,
  WorkspacesRepository,
  type CreateWorkspaceResult,
  type MemberWorkspace,
  type NewWorkspace,
} from '../../src/workspaces/repositories/workspaces.repository.js';
import {
  SlugCheckRateLimiter,
  type RateLimitCheckResult,
} from '../../src/workspaces/slugCheckRateLimiter.js';

export function makeMemberWorkspace(
  overrides: Partial<MemberWorkspace> = {},
): MemberWorkspace {
  return {
    id: 'ws-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    logo: null,
    backgroundColor: '#0F172A',
    organizationSize: '2-10',
    timezone: 'UTC',
    createdAt: new Date('2026-10-08T10:00:00.000Z'),
    role: 'owner',
    memberCount: 1,
    ...overrides,
  };
}

export class FakeWorkspacesRepository extends WorkspacesRepository {
  existingSlugs = new Set<string>();
  createResult: CreateWorkspaceResult | null = null;
  throwOnCreate: Error | null = null;
  memberWorkspaces: MemberWorkspace[] = [];
  lastWorkspaceId: string | null = null;
  rememberedWorkspaces: { userId: string; workspaceId: string }[] = [];

  slugExists(slug: string): Promise<boolean> {
    return Promise.resolve(this.existingSlugs.has(slug));
  }

  create(
    _userId: string,
    input: NewWorkspace,
    now: Date,
  ): Promise<CreateWorkspaceResult> {
    if (this.throwOnCreate) {
      return Promise.reject(this.throwOnCreate);
    }
    if (this.createResult) {
      return Promise.resolve(this.createResult);
    }
    if (this.existingSlugs.has(input.slug)) {
      return Promise.reject(new SlugAlreadyExistsError());
    }

    const created: MemberWorkspace = {
      id: input.id,
      name: input.name,
      slug: input.slug,
      logo: null,
      backgroundColor: input.backgroundColor,
      organizationSize: input.organizationSize,
      timezone: 'UTC',
      createdAt: now,
      role: 'owner',
      memberCount: 1,
    };
    this.memberWorkspaces.push(created);
    this.existingSlugs.add(input.slug);
    this.lastWorkspaceId = input.id;
    return Promise.resolve({ status: 'created', workspace: created });
  }

  listForMember(
    _userId: string,
  ): Promise<{ workspaces: MemberWorkspace[]; lastWorkspaceId: string | null }> {
    return Promise.resolve({
      workspaces: this.memberWorkspaces,
      lastWorkspaceId: this.lastWorkspaceId,
    });
  }

  findForMember(
    slug: string,
    _userId: string,
  ): Promise<MemberWorkspace | null> {
    const ws = this.memberWorkspaces.find((w) => w.slug === slug);
    return Promise.resolve(ws ?? null);
  }

  rememberLastWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    this.rememberedWorkspaces.push({ userId, workspaceId });
    this.lastWorkspaceId = workspaceId;
    return Promise.resolve();
  }
}

export class FakeSlugCheckRateLimiter extends SlugCheckRateLimiter {
  decision: RateLimitCheckResult = { allowed: true };

  check(_userId: string, _now: Date): RateLimitCheckResult {
    return this.decision;
  }
}

