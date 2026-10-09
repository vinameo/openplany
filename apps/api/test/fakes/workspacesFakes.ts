import {
  SlugAlreadyExistsError,
  WorkspacesRepository,
  type CreateWorkspaceResult,
  type MemberWorkspace,
  type NewWorkspace,
  type WorkspaceChanges,
} from '../../src/workspaces/repositories/workspaces.repository.js';

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
    updatedAt: new Date('2026-10-08T10:00:00.000Z'),
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
  updateResult: { updatedAt: Date } | null = null;
  updateCalledWith: {
    workspaceId: string;
    actorId: string;
    changes: WorkspaceChanges;
    now: Date;
  } | null = null;
  createCalledWith: {
    userId: string;
    input: NewWorkspace;
    now: Date;
    requestId: string | null;
  } | null = null;

  slugExists(slug: string): Promise<boolean> {
    return Promise.resolve(this.existingSlugs.has(slug));
  }

  create(
    userId: string,
    input: NewWorkspace,
    now: Date,
    requestId: string | null = null,
  ): Promise<CreateWorkspaceResult> {
    this.createCalledWith = { userId, input, now, requestId };
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
      updatedAt: now,
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

  update(
    workspaceId: string,
    actorId: string,
    changes: WorkspaceChanges,
    now: Date,
  ): Promise<{ updatedAt: Date } | null> {
    this.updateCalledWith = { workspaceId, actorId, changes, now };
    const keys = Object.keys(changes);
    if (keys.length === 0) {
      return Promise.reject(new Error('update called without changes'));
    }
    if (this.updateResult !== null) {
      return Promise.resolve(this.updateResult);
    }
    const ws = this.memberWorkspaces.find((w) => w.id === workspaceId);
    if (!ws) {
      return Promise.resolve(null);
    }
    Object.assign(ws, changes, { updatedAt: now });
    return Promise.resolve({ updatedAt: now });
  }
}

import {
  SlidingWindowLimiter,
  type SlidingWindowDecision,
} from '../../src/common/slidingWindowLimiter.js';
import {
  WorkspaceEvents,
  type WorkspaceUpdatedEvent,
} from '../../src/workspaces/events/workspaceEvents.js';

export class FakeSlugCheckRateLimiter extends SlidingWindowLimiter {
  decision: SlidingWindowDecision = { allowed: true };

  hit(_key: string, _now: Date): SlidingWindowDecision {
    return this.decision;
  }
}

export class FakeWorkspaceEvents extends WorkspaceEvents {
  events: WorkspaceUpdatedEvent[] = [];
  throwError: Error | null = null;

  updated(event: WorkspaceUpdatedEvent): Promise<void> {
    if (this.throwError) {
      return Promise.reject(this.throwError);
    }
    this.events.push(event);
    return Promise.resolve();
  }
}

