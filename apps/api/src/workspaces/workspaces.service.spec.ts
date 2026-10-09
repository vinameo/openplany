import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import {
  FakeSlugCheckRateLimiter,
  FakeWorkspaceEvents,
  FakeWorkspacesRepository,
  makeMemberWorkspace,
} from '../../test/fakes/workspacesFakes.js';
import { SlugAlreadyExistsError } from './repositories/workspaces.repository.js';
import { WorkspacesService } from './workspaces.service.js';

describe('WorkspacesService', () => {
  let repository: FakeWorkspacesRepository;
  let rateLimiter: FakeSlugCheckRateLimiter;
  let clock: FakeClock;
  let events: FakeWorkspaceEvents;
  let service: WorkspacesService;

  beforeEach(() => {
    repository = new FakeWorkspacesRepository();
    rateLimiter = new FakeSlugCheckRateLimiter();
    clock = new FakeClock();
    events = new FakeWorkspaceEvents();
    service = new WorkspacesService(repository, rateLimiter, clock, events);
  });

  describe('checkSlug', () => {
    it('returns rate limited 429 when rate limit is exceeded', async () => {
      rateLimiter.decision = { allowed: false, retryAfterSeconds: 45 };

      await expect(service.checkSlug('user-1', 'acme')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: 45,
      });
    });

    it('returns reason INVALID without checking repository if slug is invalid', async () => {
      let repoCalled = false;
      repository.slugExists = () => {
        repoCalled = true;
        return Promise.resolve(false);
      };

      const result = await service.checkSlug('user-1', 'ab');
      expect(result).toEqual({ slug: 'ab', available: false, reason: 'INVALID' });
      expect(repoCalled).toBe(false);

      const result2 = await service.checkSlug('user-1', '-bad-prefix');
      expect(result2).toEqual({
        slug: '-bad-prefix',
        available: false,
        reason: 'INVALID',
      });
      expect(repoCalled).toBe(false);
    });

    it('returns reason RESERVED without checking repository if slug is reserved', async () => {
      let repoCalled = false;
      repository.slugExists = () => {
        repoCalled = true;
        return Promise.resolve(false);
      };

      const result = await service.checkSlug('user-1', 'admin');
      expect(result).toEqual({
        slug: 'admin',
        available: false,
        reason: 'RESERVED',
      });
      expect(repoCalled).toBe(false);

      const result2 = await service.checkSlug('user-1', 'slug-check');
      expect(result2).toEqual({
        slug: 'slug-check',
        available: false,
        reason: 'RESERVED',
      });
      expect(repoCalled).toBe(false);
    });

    it('returns reason TAKEN when slug already exists in database', async () => {
      repository.existingSlugs.add('acme-corp');

      const result = await service.checkSlug('user-1', 'acme-corp');
      expect(result).toEqual({
        slug: 'acme-corp',
        available: false,
        reason: 'TAKEN',
      });
    });

    it('returns available true with reason null when slug is free', async () => {
      const result = await service.checkSlug('user-1', 'my-team');
      expect(result).toEqual({
        slug: 'my-team',
        available: true,
        reason: null,
      });
    });
  });

  describe('create', () => {
    it('creates workspace and returns mapped response', async () => {
      const result = await service.create('user-1', {
        name: 'Acme Corporation',
        slug: 'acme-corp',
        organizationSize: '2-10',
      });

      expect(result).toMatchObject({
        name: 'Acme Corporation',
        slug: 'acme-corp',
        organizationSize: '2-10',
        role: 'owner',
        memberCount: 1,
      });
      expect(result.id).toBeDefined();
      expect(result.backgroundColor).toMatch(/^#[0-9A-F]{6}$/);
      expect(repository.lastWorkspaceId).toBe(result.id);
      expect(repository.createCalledWith?.requestId).toBeNull();
    });

    it('forwards requestId to repository when provided', async () => {
      await service.create(
        'user-1',
        {
          name: 'Acme Corp',
          slug: 'acme-corp',
          organizationSize: '2-10',
        },
        'req-xyz-456',
      );

      expect(repository.createCalledWith?.requestId).toBe('req-xyz-456');
    });

    it('throws 429 TOO_MANY_ATTEMPTS when rate limited by database check', async () => {
      repository.createResult = { status: 'rate_limited', retryAfterSeconds: 300 };

      await expect(
        service.create('user-1', {
          name: 'Acme',
          slug: 'acme',
          organizationSize: 'Just myself',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: 300,
      });
    });

    it('throws 401 UNAUTHENTICATED when user account is inactive', async () => {
      repository.createResult = { status: 'user_inactive' };

      await expect(
        service.create('user-1', {
          name: 'Acme',
          slug: 'acme',
          organizationSize: 'Just myself',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        code: 'UNAUTHENTICATED',
      });
    });

    it('throws 409 SLUG_ALREADY_EXISTS with fields.slug on race condition conflict', async () => {
      repository.throwOnCreate = new SlugAlreadyExistsError();

      await expect(
        service.create('user-1', {
          name: 'Acme',
          slug: 'acme',
          organizationSize: 'Just myself',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: 'SLUG_ALREADY_EXISTS',
        fields: {
          slug: 'This URL is already taken. Choose another one.',
        },
      });
    });
  });

  describe('listForMember', () => {
    it('returns list of workspaces with lastWorkspaceSlug', async () => {
      const ws1 = makeMemberWorkspace({
        id: 'ws-1',
        name: 'Alpha',
        slug: 'alpha',
      });
      const ws2 = makeMemberWorkspace({
        id: 'ws-2',
        name: 'Beta',
        slug: 'beta',
      });
      repository.memberWorkspaces = [ws1, ws2];
      repository.lastWorkspaceId = 'ws-2';

      const res = await service.listForMember('user-1');
      expect(res.workspaces).toHaveLength(2);
      expect(res.workspaces[0]!.slug).toBe('alpha');
      expect(res.workspaces[1]!.slug).toBe('beta');
      expect(res.lastWorkspaceSlug).toBe('beta');
    });

    it('returns lastWorkspaceSlug null if no active last workspace', async () => {
      const ws1 = makeMemberWorkspace({ id: 'ws-1', slug: 'alpha' });
      repository.memberWorkspaces = [ws1];
      repository.lastWorkspaceId = 'deleted-ws-id';

      const res = await service.listForMember('user-1');
      expect(res.lastWorkspaceSlug).toBeNull();
    });
  });

  describe('rememberLastWorkspace', () => {
    it('catches and logs errors without bubbling up', async () => {
      repository.rememberLastWorkspace = () =>
        Promise.reject(new Error('DB failure'));

      await expect(
        service.rememberLastWorkspace('user-1', 'ws-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('update', () => {
    it('throws 400 VALIDATION_ERROR when body has no editable fields', async () => {
      const ws = makeMemberWorkspace();
      await expect(
        service.update(ws, 'user-1', {}),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Nothing to update',
      });
    });

    it('returns 200 without calling repository or emitting events when no values changed', async () => {
      const ws = makeMemberWorkspace({
        name: 'Acme',
        organizationSize: '2-10',
        timezone: 'UTC',
      });

      let repoUpdateCalled = false;
      repository.update = () => {
        repoUpdateCalled = true;
        return Promise.resolve({ updatedAt: new Date() });
      };

      const res = await service.update(ws, 'user-1', {
        name: 'Acme',
        timezone: 'UTC',
      });

      expect(res.name).toBe('Acme');
      expect(repoUpdateCalled).toBe(false);
      expect(events.events).toHaveLength(0);
    });

    it('updates changed fields, calls repository and emits event with from/to', async () => {
      const ws = makeMemberWorkspace({
        id: 'ws-1',
        name: 'Old Name',
        organizationSize: '2-10',
        timezone: 'UTC',
      });
      repository.memberWorkspaces = [ws];

      const newDate = new Date('2026-10-09T08:00:00.000Z');
      clock.now = () => newDate;

      const res = await service.update(
        ws,
        'user-1',
        { name: 'New Name', timezone: 'Asia/Ho_Chi_Minh' },
        'req-123',
      );

      expect(res.name).toBe('New Name');
      expect(res.timezone).toBe('Asia/Ho_Chi_Minh');
      expect(repository.updateCalledWith).toEqual({
        workspaceId: 'ws-1',
        actorId: 'user-1',
        changes: {
          name: 'New Name',
          timezone: 'Asia/Ho_Chi_Minh',
        },
        now: newDate,
      });

      expect(events.events).toHaveLength(1);
      expect(events.events[0]).toEqual({
        workspaceId: 'ws-1',
        actorId: 'user-1',
        actorRole: 'owner',
        occurredAt: newDate,
        requestId: 'req-123',
        changes: {
          name: { from: 'Old Name', to: 'New Name' },
          timezone: { from: 'UTC', to: 'Asia/Ho_Chi_Minh' },
        },
      });
    });

    it('throws 404 NOT_FOUND when repository returns null (soft-deleted)', async () => {
      const ws = makeMemberWorkspace({ id: 'ws-deleted' });
      repository.memberWorkspaces = []; // not in repo

      await expect(
        service.update(ws, 'user-1', { name: 'Renamed' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    });

    it('returns response even if event emission fails', async () => {
      const ws = makeMemberWorkspace({ id: 'ws-1', name: 'Old' });
      repository.memberWorkspaces = [ws];
      events.throwError = new Error('Kafka down');

      const res = await service.update(ws, 'user-1', { name: 'New' });
      expect(res.name).toBe('New');
    });
  });
});
