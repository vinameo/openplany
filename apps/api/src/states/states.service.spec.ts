import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import type { WorkItemState } from './entities/workItemState.entity.js';
import { StatesRepository } from './repositories/states.repository.js';
import { StateCatalog } from './stateCatalog.js';
import { StateEvents } from './stateEvents.js';
import { StatesService } from './states.service.js';

describe('StatesService', () => {
  const fixedNow = new Date('2026-10-28T12:00:00Z');

  const defaultBacklog: WorkItemState = {
    id: 'backlog-id',
    level: 'default',
    defaultKey: 'backlog',
    workspaceId: null,
    projectId: null,
    name: 'Backlog',
    group: 'backlog',
    color: '#8E98A8',
    createdById: null,
    updatedById: null,
    deletedById: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  };

  const projectState: WorkItemState = {
    id: '11111111-1111-4111-8111-111111111111',
    level: 'project',
    defaultKey: null,
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Review',
    group: 'active',
    color: '#3E7BD6',
    createdById: 'user-1',
    updatedById: 'user-1',
    deletedById: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  };

  const workspaceState: WorkItemState = {
    id: '22222222-2222-4222-8222-222222222222',
    level: 'workspace',
    defaultKey: null,
    workspaceId: 'ws-1',
    projectId: null,
    name: 'QA',
    group: 'active',
    color: '#3E7BD6',
    createdById: 'user-1',
    updatedById: 'user-1',
    deletedById: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
  };

  function createService(
    states: WorkItemState[] = [],
    countsMap = new Map<string, number>(),
  ) {
    const workItemCounts = vi.fn().mockResolvedValue(countsMap);
    const catalog: StateCatalog = {
      workspaceLevel: vi.fn().mockResolvedValue(states),
      effectiveFor: vi.fn().mockResolvedValue(states),
      lockEffectiveState: vi.fn(),
      lockReplacement: vi.fn(),
      lockOwnState: vi.fn(),
      findNameClash: vi.fn(),
      workItemCounts,
    };

    const dataSource = {
      manager: {} as EntityManager,
    } as DataSource;

    const createRepo = vi.fn();
    const updateRepo = vi.fn();
    const removeRepo = vi.fn();
    const repository: StatesRepository = {
      create: createRepo,
      update: updateRepo,
      remove: removeRepo,
    };

    const onCreated = vi.fn();
    const onUpdated = vi.fn();
    const onDeleted = vi.fn();
    const events: StateEvents = {
      created: onCreated,
      updated: onUpdated,
      deleted: onDeleted,
      writeRetried: vi.fn(),
    };

    const clock: Clock = {
      now: vi.fn().mockReturnValue(fixedNow),
    } as unknown as Clock;

    const service = new StatesService(
      dataSource,
      catalog,
      repository,
      events,
      clock,
    );
    return {
      service,
      catalog,
      repository,
      createRepo,
      updateRepo,
      removeRepo,
      events,
      onCreated,
      onUpdated,
      onDeleted,
      clock,
      workItemCounts,
    };
  }

  describe('listForWorkspace', () => {
    it('returns workspace states with ownCount, ownMax, and initialStateId', async () => {
      const { service } = createService([defaultBacklog, workspaceState]);

      const res = await service.listForWorkspace({
        workspaceId: 'ws-1',
        canManage: false,
      });

      expect(res.ownCount).toBe(1);
      expect(res.ownMax).toBe(50);
      expect(res.initialStateId).toBe('backlog-id');
      expect(res.states).toHaveLength(2);
      expect(res.states[0]).toEqual({
        id: 'backlog-id',
        name: 'Backlog',
        group: 'backlog',
        color: '#8E98A8',
        level: 'default',
      });
      expect(res.states[0]?.workItemCount).toBeUndefined();
      expect(res.states[1]?.workItemCount).toBeUndefined();
    });

    it('includes workItemCount when canManage is true, scoped to workspace', async () => {
      const counts = new Map<string, number>([
        ['backlog-id', 7],
        ['22222222-2222-4222-8222-222222222222', 3],
      ]);
      const { service, workItemCounts } = createService(
        [defaultBacklog, workspaceState],
        counts,
      );

      const res = await service.listForWorkspace({
        workspaceId: 'ws-1',
        canManage: true,
      });

      expect(workItemCounts).toHaveBeenCalledWith(expect.anything(), {
        stateIds: ['backlog-id', '22222222-2222-4222-8222-222222222222'],
        scope: {
          level: 'workspace',
          workspaceId: 'ws-1',
        },
      });
      expect(res.states[0]?.workItemCount).toBe(7);
      expect(res.states[1]?.workItemCount).toBe(3);
    });
  });

  describe('listForProject', () => {
    it('returns effective states with ownCount, ownMax, and initialStateId', async () => {
      const { service } = createService([defaultBacklog, projectState]);

      const res = await service.listForProject({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        canManage: false,
      });

      expect(res.ownCount).toBe(1);
      expect(res.ownMax).toBe(50);
      expect(res.initialStateId).toBe('backlog-id');
      expect(res.states).toHaveLength(2);
      expect(res.states[0]).toEqual({
        id: 'backlog-id',
        name: 'Backlog',
        group: 'backlog',
        color: '#8E98A8',
        level: 'default',
      });
      expect(res.states[0]?.workItemCount).toBeUndefined();
      expect(res.states[1]?.workItemCount).toBeUndefined();
    });

    it('includes workItemCount when canManage is true', async () => {
      const counts = new Map<string, number>([
        ['backlog-id', 5],
        ['11111111-1111-4111-8111-111111111111', 2],
      ]);
      const { service, workItemCounts } = createService(
        [defaultBacklog, projectState],
        counts,
      );

      const res = await service.listForProject({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        canManage: true,
      });

      expect(workItemCounts).toHaveBeenCalled();
      expect(res.states[0]?.workItemCount).toBe(5);
      expect(res.states[1]?.workItemCount).toBe(2);
    });
  });

  describe('create outcomes (DB B3.2, API B5)', () => {
    it('returns created state on success and emits event', async () => {
      const { service, createRepo, onCreated } = createService();
      createRepo.mockResolvedValue({
        status: 'created',
        state: projectState,
      });

      const res = await service.create({
        scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
        actorId: 'user-1',
        dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        requestId: 'req-1',
      });

      expect(res.state).toEqual({
        id: projectState.id,
        name: projectState.name,
        group: projectState.group,
        color: projectState.color,
        level: projectState.level,
        workItemCount: 0,
      });
      expect(onCreated).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        stateId: projectState.id,
        level: 'project',
        group: 'active',
        actorId: 'user-1',
        requestId: 'req-1',
      });
    });

    it('maps workspace_gone to 404 NOT_FOUND', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({
        status: 'workspace_gone',
      });

      await expect(
        service.create({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('maps project_gone to 404 PROJECT_NOT_FOUND', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({
        status: 'project_gone',
      });

      await expect(
        service.create({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
      });
    });

    it('maps forbidden to 403 FORBIDDEN', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({ status: 'forbidden' });

      await expect(
        service.create({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('maps actor_inactive to 401 UNAUTHENTICATED', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({
        status: 'actor_inactive',
      });

      await expect(
        service.create({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('maps limit_reached at project level to 409 PROJECT_STATE_LIMIT_REACHED', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({
        status: 'limit_reached',
      });

      await expect(
        service.create({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'PROJECT_STATE_LIMIT_REACHED',
      });
    });

    it('maps limit_reached at workspace level to 409 WORKSPACE_STATE_LIMIT_REACHED', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({
        status: 'limit_reached',
      });

      await expect(
        service.create({
          scope: { level: 'workspace', workspaceId: 'ws-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'WORKSPACE_STATE_LIMIT_REACHED',
      });
    });

    it('maps name_taken to 409 STATE_NAME_TAKEN', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({ status: 'name_taken' });

      try {
        await service.create({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        const apiErr = err as ApiException;
        expect(apiErr.getStatus()).toBe(409);
        expect(apiErr.code).toBe('STATE_NAME_TAKEN');
        expect(apiErr.getEnglishFields()?.name).toBe(
          'A state with this name already exists.',
        );
      }
    });

    it('maps name_taken_in_projects to 409 STATE_NAME_TAKEN_IN_PROJECTS with count', async () => {
      const { service, createRepo } = createService();
      createRepo.mockResolvedValue({
        status: 'name_taken_in_projects',
        count: 3,
      });

      try {
        await service.create({
          scope: { level: 'workspace', workspaceId: 'ws-1' },
          actorId: 'user-1',
          dto: { name: 'Review', group: 'active', color: '#3E7BD6' },
        });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        const apiErr = err as ApiException;
        expect(apiErr.getStatus()).toBe(409);
        expect(apiErr.code).toBe('STATE_NAME_TAKEN_IN_PROJECTS');
        expect(apiErr.count).toBe(3);
        expect(apiErr.getEnglishFields()?.name).toContain(
          '3 projects already have',
        );
      }
    });
  });

  describe('update outcomes (DB B3.2, API B5)', () => {
    it('returns updated state on success and emits event with changed fields', async () => {
      const { service, updateRepo, onUpdated } = createService();
      updateRepo.mockResolvedValue({
        status: 'updated',
        state: Object.assign({}, projectState, { group: 'finished' as const }),
        count: 5,
        changed: ['group'],
      });

      const res = await service.update({
        scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
        actorId: 'user-1',
        stateId: projectState.id,
        dto: { group: 'finished', confirmGroupChange: true },
        requestId: 'req-2',
      });

      expect(res.state).toEqual({
        id: projectState.id,
        name: projectState.name,
        group: 'finished',
        color: projectState.color,
        level: projectState.level,
        workItemCount: 5,
      });
      expect(onUpdated).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        stateId: projectState.id,
        level: 'project',
        group: 'finished',
        actorId: 'user-1',
        changed: ['group'],
        requestId: 'req-2',
      });
    });

    it('rejects invalid stateId UUID with 404 STATE_NOT_FOUND', async () => {
      const { service } = createService();

      await expect(
        service.update({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: 'not-a-uuid',
          dto: { name: 'New Name' },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'STATE_NOT_FOUND',
      });
    });

    it('maps not_found to 404 STATE_NOT_FOUND', async () => {
      const { service, updateRepo } = createService();
      updateRepo.mockResolvedValue({ status: 'not_found' });

      await expect(
        service.update({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
          dto: { name: 'New Name' },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'STATE_NOT_FOUND',
      });
    });

    it('maps group_change_unconfirmed to 409 STATE_GROUP_CHANGE_UNCONFIRMED with count', async () => {
      const { service, updateRepo } = createService();
      updateRepo.mockResolvedValue({
        status: 'group_change_unconfirmed',
        count: 7,
      });

      try {
        await service.update({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
          dto: { group: 'finished' },
        });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        const apiErr = err as ApiException;
        expect(apiErr.getStatus()).toBe(409);
        expect(apiErr.code).toBe('STATE_GROUP_CHANGE_UNCONFIRMED');
        expect(apiErr.count).toBe(7);
      }
    });

    it('maps name_taken to 409 STATE_NAME_TAKEN', async () => {
      const { service, updateRepo } = createService();
      updateRepo.mockResolvedValue({ status: 'name_taken' });

      await expect(
        service.update({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
          dto: { name: 'Backlog' },
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'STATE_NAME_TAKEN',
      });
    });
  });

  describe('remove outcomes (DB B3.2, API B5)', () => {
    it('successfully deletes a state and emits state.deleted event', async () => {
      const { service, removeRepo, onDeleted } = createService();
      removeRepo.mockResolvedValue({
        status: 'deleted',
        state: projectState,
        movedWorkItems: 4,
      });

      await service.remove({
        scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
        actorId: 'user-1',
        stateId: projectState.id,
        replacementStateId: defaultBacklog.id,
        requestId: 'req-del-1',
      });

      expect(removeRepo).toHaveBeenCalledWith({
        scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
        actorId: 'user-1',
        stateId: projectState.id,
        replacementStateId: defaultBacklog.id,
        now: fixedNow,
      });

      expect(onDeleted).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        stateId: projectState.id,
        level: projectState.level,
        group: projectState.group,
        actorId: 'user-1',
        replacementStateId: defaultBacklog.id,
        movedWorkItems: 4,
        durationMs: expect.any(Number),
        requestId: 'req-del-1',
      });
    });

    it('rejects invalid stateId UUID with 404 STATE_NOT_FOUND', async () => {
      const { service } = createService();

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: 'not-a-uuid',
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'STATE_NOT_FOUND',
      });
    });

    it('maps workspace_gone to 404 NOT_FOUND', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'workspace_gone' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('maps project_gone to 404 PROJECT_NOT_FOUND', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'project_gone' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
      });
    });

    it('maps forbidden to 403 FORBIDDEN', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'forbidden' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
        }),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('maps actor_inactive to 401 UNAUTHENTICATED', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'actor_inactive' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
        }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('maps not_found to 404 STATE_NOT_FOUND', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'not_found' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'STATE_NOT_FOUND',
      });
    });

    it('maps replacement_required to 409 STATE_REPLACEMENT_REQUIRED', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'replacement_required' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'STATE_REPLACEMENT_REQUIRED',
      });
    });

    it('maps replacement_invalid to 409 STATE_REPLACEMENT_INVALID', async () => {
      const { service, removeRepo } = createService();
      removeRepo.mockResolvedValue({ status: 'replacement_invalid' });

      await expect(
        service.remove({
          scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
          actorId: 'user-1',
          stateId: projectState.id,
          replacementStateId: 'bad-replacement-uuid',
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'STATE_REPLACEMENT_INVALID',
      });
    });
  });
});
