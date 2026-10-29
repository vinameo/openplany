import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import { acquireTransactionLock } from '../../database/advisoryLock.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import { lockProjectForActor } from '../../projects/access/lockProjectForActor.js';
import { ProjectAccessResolver } from '../../projects/access/projectAccessResolver.js';
import { lockWorkspaceForActor } from '../../workspaces/access/lockWorkspaceForActor.js';
import { WorkItem } from '../../workItems/entities/workItem.entity.js';
import { WorkItemState } from '../entities/workItemState.entity.js';
import {
  StateCatalog,
  ownStatesMax,
  type StateScope,
} from '../stateCatalog.js';
import { StateEvents, type StateWriteRetriedEvent } from '../stateEvents.js';
import { liveWorkItemsIn, ownStates } from '../stateFilters.js';
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

/** Unique indexes on live state names a workspace or project insert can hit (migration CreateWorkItemStates). */
const STATE_NAME_INDEXES = [
  'work_item_states_workspace_name_key',
  'work_item_states_project_name_key',
] as const;

function isStateNameViolation(err: unknown): boolean {
  return STATE_NAME_INDEXES.some((index) => isUniqueViolation(err, index));
}

@Injectable()
export class TypeOrmStatesRepository implements StatesRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: ProjectAccessResolver,
    private readonly catalog: StateCatalog,
    private readonly events: StateEvents,
  ) {}

  // Steps A1 & A2: lock the scope's rows and decide the manage permission on them
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
        requiredPermission: 'workspace.states.manage',
      });
      return locked.kind === 'ok' ? { status: 'ok' } : { status: locked.kind };
    }

    const locked = await lockProjectForActor(manager, this.resolver, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      actorId,
      projectLock: 'pessimistic_read',
    });
    if (locked.kind !== 'ok') {
      return { status: locked.kind };
    }
    return locked.access.permissions.includes('project.states.manage')
      ? { status: 'ok' }
      : { status: 'forbidden' };
  }

  /** Runs one state write, retrying on deadlocks and serialization failures (DB B3.2) and logging each retry. */
  private runWrite<T>(
    operation: StateWriteRetriedEvent['operation'],
    scope: StateScope,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return runTransactionWithRetry(this.dataSource, work, {
      maxAttempts: 3,
      onRetry: (attempt) =>
        this.events.writeRetried({
          operation,
          workspaceId: scope.workspaceId,
          ...(scope.level === 'project' && { projectId: scope.projectId }),
          attempt,
        }),
    });
  }

  async create(input: CreateStateRepoInput): Promise<CreateStateRepoResult> {
    try {
      return await this.runWrite('create', input.scope, async (manager) => {
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
        const ownCount = await manager.count(WorkItemState, {
          where: ownStates(input.scope),
        });
        if (ownCount >= ownStatesMax(input.scope)) {
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

        const saved = await manager.save(WorkItemState, entity);
        return { status: 'created', state: saved };
      });
    } catch (err: unknown) {
      // C3: a name index violation (A3 makes it near impossible) aborts the transaction; not retried
      if (isStateNameViolation(err)) {
        return { status: 'name_taken' };
      }
      throw err;
    }
  }

  async update(input: UpdateStateRepoInput): Promise<UpdateStateRepoResult> {
    try {
      return await this.runWrite('update', input.scope, async (manager) => {
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

        const saved = await manager.save(WorkItemState, state);

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
      });
    } catch (err: unknown) {
      if (isStateNameViolation(err)) {
        return { status: 'name_taken' };
      }
      throw err;
    }
  }

  async remove(input: RemoveStateRepoInput): Promise<RemoveStateRepoResult> {
    return await this.runWrite('delete', input.scope, async (manager) => {
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
        // Same filter as the X3 count (stateFilters.liveWorkItemsIn), so what is counted is what moves
        const toMove = liveWorkItemsIn(manager, input.scope)
          .select('wi.id')
          .andWhere('wi.stateId = :targetStateId', {
            targetStateId: targetState.id,
          });
        // No alias in an UPDATE: `id` and `stateId` are WorkItem property names, mapped to columns by TypeORM
        const updateResult = await manager
          .createQueryBuilder()
          .update(WorkItem)
          .set({ stateId: replacementState.id })
          .where(`id IN (${toMove.getQuery()})`)
          .setParameters(toMove.getParameters())
          .execute();
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
    });
  }
}
