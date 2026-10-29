import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AccessibleProject } from '../projects/access/projectAccessResolver.js';
import type { WorkItem } from './entities/workItem.entity.js';
import type { WorkItemEvents } from './events/workItemEvents.js';
import type {
  CreateWorkItemRepoInput,
  CreateWorkItemRepoResult,
  WorkItemsRepository,
} from './repositories/workItems.repository.js';
import { WorkItemsService } from './workItems.service.js';

describe('WorkItemsService', () => {
  const fixedNow = new Date('2026-10-28T12:00:00Z');
  const clock = { now: () => fixedNow, sleep: vi.fn() };

  const project: AccessibleProject = {
    project: {
      id: 'proj-1',
      identifier: 'OPS',
      name: 'Operations',
      description: '',
      iconName: 'square-check',
      iconColor: '#868E96',
      coverKey: 'cover-01',
      createdAt: fixedNow,
      updatedAt: fixedNow,
      timezone: null,
    },
    access: {
      role: 'contributor',
      permissions: ['project.workitems.create'],
    },
  };

  const sampleWorkItem: WorkItem = {
    id: 'wi-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    stateId: 'state-1',
    priorityId: 'prio-1',
    number: 1,
    title: 'Fix login',
    description: '## Steps',
    idempotencyKey: 'key-1',
    createdById: 'user-1',
    updatedById: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  };

  function setup(repoResult: CreateWorkItemRepoResult) {
    const createRepoMock = vi.fn<
      (input: CreateWorkItemRepoInput) => Promise<CreateWorkItemRepoResult>
    >(async () => repoResult);
    const repository: WorkItemsRepository = {
      create: createRepoMock,
    };

    const onWorkItemCreated = vi.fn();
    const onWorkItemReplayed = vi.fn();
    const onWorkItemForbidden = vi.fn();
    const onWorkItemKeyReused = vi.fn();
    const onTransactionRetry = vi.fn();

    const events: WorkItemEvents = {
      onWorkItemCreated,
      onWorkItemReplayed,
      onWorkItemForbidden,
      onWorkItemKeyReused,
      onTransactionRetry,
    };

    const service = new WorkItemsService(repository, events, clock);
    return {
      service,
      repository,
      createRepoMock,
      events,
      onWorkItemCreated,
      onWorkItemReplayed,
      onWorkItemForbidden,
      onWorkItemKeyReused,
    };
  }

  it('maps created status to outcome: created and emits onWorkItemCreated', async () => {
    const { service, onWorkItemCreated } = setup({
      status: 'created',
      workItem: sampleWorkItem,
    });

    const res = await service.create({
      workspaceId: 'ws-1',
      project,
      actorId: 'user-1',
      title: 'Fix login',
      description: '## Steps',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });

    expect(res.outcome).toBe('created');
    expect(res.workItem).toEqual({
      id: 'wi-1',
      number: 1,
      key: 'OPS-1',
      title: 'Fix login',
      description: '## Steps',
      stateId: 'state-1',
      priorityId: 'prio-1',
      createdById: 'user-1',
      createdAt: fixedNow.toISOString(),
    });
    expect(onWorkItemCreated).toHaveBeenCalledWith({
      workItemId: 'wi-1',
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      actorId: 'user-1',
      number: 1,
      requestId: 'req-1',
    });
  });

  it('maps replayed status to outcome: replayed and emits onWorkItemReplayed', async () => {
    const { service, onWorkItemReplayed } = setup({
      status: 'replayed',
      workItem: sampleWorkItem,
    });

    const res = await service.create({
      workspaceId: 'ws-1',
      project,
      actorId: 'user-1',
      title: 'Fix login',
      description: '## Steps',
      idempotencyKey: 'key-1',
      requestId: 'req-2',
    });

    expect(res.outcome).toBe('replayed');
    expect(res.workItem.key).toBe('OPS-1');
    expect(onWorkItemReplayed).toHaveBeenCalledWith({
      workItemId: 'wi-1',
      projectId: 'proj-1',
      actorId: 'user-1',
      requestId: 'req-2',
    });
  });

  it('throws 404 PROJECT_NOT_FOUND when repository returns project_gone', async () => {
    const { service } = setup({ status: 'project_gone' });

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: 'PROJECT_NOT_FOUND',
      messageRef: { key: 'project:errors.notFound' },
    });
  });

  it('throws 403 FORBIDDEN and emits onWorkItemForbidden when repository returns forbidden', async () => {
    const { service, onWorkItemForbidden } = setup({ status: 'forbidden' });

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
        requestId: 'req-forbid',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      messageRef: { key: 'errors:forbidden' },
    });

    expect(onWorkItemForbidden).toHaveBeenCalledWith(
      'proj-1',
      'user-1',
      'req-forbid',
    );
  });

  it('throws 401 UNAUTHENTICATED when repository returns actor_inactive', async () => {
    const { service } = setup({ status: 'actor_inactive' });

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      code: 'UNAUTHENTICATED',
      messageRef: { key: 'errors:http.unauthenticated' },
    });
  });

  it('throws 409 WORK_ITEM_REQUEST_REUSED and emits onWorkItemKeyReused when repository returns key_reused', async () => {
    const { service, onWorkItemKeyReused } = setup({ status: 'key_reused' });

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
        requestId: 'req-reused',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      code: 'WORK_ITEM_REQUEST_REUSED',
      messageRef: { key: 'workItem:errors.requestReused' },
    });

    expect(onWorkItemKeyReused).toHaveBeenCalledWith(
      'proj-1',
      'user-1',
      'req-reused',
    );
  });

  it('throws 409 STATE_UNAVAILABLE when repository returns state_unavailable', async () => {
    const { service } = setup({ status: 'state_unavailable' });

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
        stateId: 'deleted-state-id',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      code: 'STATE_UNAVAILABLE',
      messageRef: { key: 'workItem:errors.stateUnavailable' },
    });
  });

  it('throws 409 PRIORITY_UNAVAILABLE when repository returns priority_unavailable (AC-07)', async () => {
    const { service, createRepoMock } = setup({
      status: 'priority_unavailable',
    });

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
        priorityId: 'bad-priority-id',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      code: 'PRIORITY_UNAVAILABLE',
      messageRef: { key: 'workItem:errors.priorityUnavailable' },
    });

    expect(createRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        priorityId: 'bad-priority-id',
      }),
    );
  });

  it('throws 500 INTERNAL_ERROR and logs error when initial priority is missing (AC-27)', async () => {
    const { service } = setup({ status: 'initial_priority_missing' });
    const logSpy = vi
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {});

    await expect(
      service.create({
        workspaceId: 'ws-1',
        project,
        actorId: 'user-1',
        title: 'Fix login',
        description: '## Steps',
        idempotencyKey: 'key-1',
        requestId: 'req-corrupt',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      messageRef: { key: 'workItem:errors.generic' },
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('proj-1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('req-corrupt'));
  });
});
