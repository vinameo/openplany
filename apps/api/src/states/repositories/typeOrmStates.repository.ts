import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { PROJECT_STATES_MAX, WORKSPACE_STATES_MAX } from '@repo/contracts';
import { acquireTransactionLock } from '../../database/advisoryLock.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import { lockProjectForActor } from '../../projects/access/lockProjectForActor.js';
import { ProjectAccessResolver } from '../../projects/access/projectAccessResolver.js';
import { Project } from '../../projects/entities/project.entity.js';
import { lockWorkspaceForActor } from '../../workspaces/access/lockWorkspaceForActor.js';
import { WorkItem } from '../../workItems/entities/workItem.entity.js';
import { WorkItemState } from '../entities/workItemState.entity.js';
import { StateCatalog, type StateScope } from '../stateCatalog.js';
import {
  StatesRepository,
  type CreateStateRepoInput,
  type CreateStateRepoResult,
  type RemoveStateRepoInput,
  type RemoveStateRepoResult,
  type UpdateStateRepoInput,
  type UpdateStateRepoResult,
} from './states.repository.js';

type LockAuthResult =
  | { status: 'ok' }
  | { status: 'workspace_gone' }
  | { status: 'project_gone' }
  | { status: 'forbidden' }
  | { status: 'actor_inactive' };

@Injectable()
export class TypeOrmStatesRepository implements StatesRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: ProjectAccessResolver,
    private readonly catalog: StateCatalog,
  ) {}

  private async lockAndAuthorize(
    manager: EntityManager,
    scope: StateScope,
    actorId: string,
  ): Promise<LockAuthResult> {
    if (scope.level === 'workspace') {
      const locked = await lockWorkspaceForActor(manager, {
        workspaceId: scope.workspaceId,
        actorId,
        workspaceLock: 'pessimistic_read',
      });
      if (locked.kind === 'workspace_gone') {
        return { status: 'workspace_gone' };
      }
      if (locked.kind === 'forbidden') {
        return { status: 'forbidden' };
      }
      if (locked.kind === 'actor_inactive') {
        return { status: 'actor_inactive' };
      }
      if (!locked.permissions.includes('workspace.states.manage')) {
        return { status: 'forbidden' };
      }
      return { status: 'ok' };
    }

    const locked = await lockProjectForActor(manager, this.resolver, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      actorId,
      projectLock: 'pessimistic_read',
    });
    if (locked.kind === 'project_gone') {
      return { status: 'project_gone' };
    }
    if (locked.kind === 'forbidden') {
      return { status: 'forbidden' };
    }
    if (locked.kind === 'actor_inactive') {
      return { status: 'actor_inactive' };
    }
    if (!locked.access.permissions.includes('project.states.manage')) {
      return { status: 'forbidden' };
    }
    return { status: 'ok' };
  }

  async create(input: CreateStateRepoInput): Promise<CreateStateRepoResult> {
    return await runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        // Step A1 & A2: Lock and verify manage permission
        const auth = await this.lockAndAuthorize(
          manager,
          input.scope,
          input.actorId,
        );
        if (auth.status !== 'ok') {
          return auth;
        }

        // Step A3: Acquire workspace-level advisory lock
        await acquireTransactionLock(
          manager,
          'work-item-states',
          input.scope.workspaceId,
        );

        // Step C1: Check maximum allowed states for own level
        const max =
          input.scope.level === 'workspace'
            ? WORKSPACE_STATES_MAX
            : PROJECT_STATES_MAX;

        const whereClause =
          input.scope.level === 'workspace'
            ? {
                level: 'workspace' as const,
                workspaceId: input.scope.workspaceId,
                deletedAt: IsNull(),
              }
            : {
                level: 'project' as const,
                workspaceId: input.scope.workspaceId,
                projectId: input.scope.projectId,
                deletedAt: IsNull(),
              };

        const ownCount = await manager.count(WorkItemState, {
          where: whereClause,
        });
        if (ownCount >= max) {
          return { status: 'limit_reached' };
        }

        // Step C2: Name collision check in DB
        const clash = await this.catalog.findNameClash(
          manager,
          input.scope,
          input.name,
        );
        if (clash.kind === 'same_or_upper_level') {
          return { status: 'name_taken' };
        }
        if (clash.kind === 'projects') {
          return { status: 'name_taken_in_projects', count: clash.count };
        }

        // Step C3: Insert row
        const entity = manager.create(WorkItemState, {
          level: input.scope.level,
          workspaceId: input.scope.workspaceId,
          projectId:
            input.scope.level === 'project' ? input.scope.projectId : null,
          name: input.name,
          group: input.group,
          color: input.color,
          createdById: input.actorId,
          updatedById: input.actorId,
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
          deletedById: null,
          defaultKey: null,
        });

        try {
          const saved = await manager.save(WorkItemState, entity);
          return { status: 'created', state: saved };
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            err.code === '23505'
          ) {
            return { status: 'name_taken' };
          }
          throw err;
        }
      },
      { maxAttempts: 3, onRetry: () => {} },
    );
  }

  async update(input: UpdateStateRepoInput): Promise<UpdateStateRepoResult> {
    return await runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        // Step A1 & A2: Lock and verify manage permission
        const auth = await this.lockAndAuthorize(
          manager,
          input.scope,
          input.actorId,
        );
        if (auth.status !== 'ok') {
          return auth;
        }

        // Step A3: Acquire workspace-level advisory lock
        await acquireTransactionLock(
          manager,
          'work-item-states',
          input.scope.workspaceId,
        );

        // Step U1: Lock own state
        const state = await this.catalog.lockOwnState(
          manager,
          input.scope,
          input.stateId,
        );
        if (state === null) {
          return { status: 'not_found' };
        }

        // Step U2: Name collision check if renaming
        if (input.name !== undefined) {
          const clash = await this.catalog.findNameClash(
            manager,
            input.scope,
            input.name,
            state.id,
          );
          if (clash.kind === 'same_or_upper_level') {
            return { status: 'name_taken' };
          }
          if (clash.kind === 'projects') {
            return { status: 'name_taken_in_projects', count: clash.count };
          }
        }

        // Step U3: Group change check with work items
        let liveCount: number | undefined;
        if (input.group !== undefined && input.group !== state.group) {
          const counts = await this.catalog.workItemCounts(manager, {
            stateIds: [state.id],
            scope: input.scope,
          });
          liveCount = counts.get(state.id) ?? 0;
          if (liveCount > 0 && !input.confirmGroupChange) {
            return { status: 'group_change_unconfirmed', count: liveCount };
          }
        }

        // Step U4: Apply changes and record changed fields
        const changed: ('name' | 'group' | 'color')[] = [];
        if (input.name !== undefined && input.name !== state.name) {
          changed.push('name');
        }
        if (input.group !== undefined && input.group !== state.group) {
          changed.push('group');
        }
        if (input.color !== undefined && input.color !== state.color) {
          changed.push('color');
        }

        if (input.name !== undefined) state.name = input.name;
        if (input.group !== undefined) state.group = input.group;
        if (input.color !== undefined) state.color = input.color;
        state.updatedById = input.actorId;
        state.updatedAt = input.now;

        let saved: WorkItemState;
        try {
          saved = await manager.save(WorkItemState, state);
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            err.code === '23505'
          ) {
            return { status: 'name_taken' };
          }
          throw err;
        }

        // Step U5: Commit -> updated with workItemCount
        if (liveCount === undefined) {
          const counts = await this.catalog.workItemCounts(manager, {
            stateIds: [saved.id],
            scope: input.scope,
          });
          liveCount = counts.get(saved.id) ?? 0;
        }

        return {
          status: 'updated',
          state: saved,
          count: liveCount,
          changed,
        };
      },
      { maxAttempts: 3, onRetry: () => {} },
    );
  }

  async remove(input: RemoveStateRepoInput): Promise<RemoveStateRepoResult> {
    return await runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        // Step A1 & A2: Lock and verify manage permission
        const auth = await this.lockAndAuthorize(
          manager,
          input.scope,
          input.actorId,
        );
        if (auth.status !== 'ok') {
          return auth;
        }

        // Step A3: Acquire workspace-level advisory lock
        await acquireTransactionLock(
          manager,
          'work-item-states',
          input.scope.workspaceId,
        );

        // Step X1: Lock own state
        const targetState = await this.catalog.lockOwnState(
          manager,
          input.scope,
          input.stateId,
        );
        if (targetState === null) {
          return { status: 'not_found' };
        }

        // Step X2: Validate replacementStateId if provided
        let replacementState: WorkItemState | null = null;
        if (input.replacementStateId !== undefined) {
          if (input.replacementStateId === targetState.id) {
            return { status: 'replacement_invalid' };
          }
          replacementState = await this.catalog.lockReplacement(
            manager,
            input.scope,
            input.replacementStateId,
          );
          if (replacementState === null) {
            return { status: 'replacement_invalid' };
          }
        }

        // Step X3: Count live work items at target state
        const counts = await this.catalog.workItemCounts(manager, {
          stateIds: [targetState.id],
          scope: input.scope,
        });
        const liveCount = counts.get(targetState.id) ?? 0;
        if (liveCount > 0 && !input.replacementStateId) {
          return { status: 'replacement_required' };
        }

        // Step X4: Move live work items if count > 0
        let movedWorkItems = 0;
        if (liveCount > 0 && replacementState) {
          const pSub = manager
            .createQueryBuilder(Project, 'p')
            .select('p.id')
            .where('p.workspaceId = :workspaceId', {
              workspaceId: input.scope.workspaceId,
            })
            .andWhere('p.deletedAt IS NULL')
            .getQuery();

          const updateQb = manager
            .createQueryBuilder()
            .update(WorkItem)
            .set({ stateId: replacementState.id })
            .where('workspace_id = :workspaceId', {
              workspaceId: input.scope.workspaceId,
            })
            .andWhere('state_id = :targetStateId', {
              targetStateId: targetState.id,
            })
            .andWhere('deleted_at IS NULL')
            .andWhere(`project_id IN (${pSub})`);

          if (input.scope.level === 'project') {
            updateQb.andWhere('project_id = :projectId', {
              projectId: input.scope.projectId,
            });
          }

          const updateResult = await updateQb.execute();
          movedWorkItems = updateResult.affected ?? liveCount;
        }

        // Step X5: Soft delete target state
        targetState.deletedAt = input.now;
        targetState.deletedById = input.actorId;
        targetState.updatedAt = input.now;
        await manager.save(WorkItemState, targetState);

        // Step X6: Commit -> deleted
        return {
          status: 'deleted',
          state: targetState,
          movedWorkItems,
        };
      },
      { maxAttempts: 3, onRetry: () => {} },
    );
  }
}
