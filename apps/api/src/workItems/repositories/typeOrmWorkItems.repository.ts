import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { INITIAL_STATE_KEY } from '@repo/contracts';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import { lockProjectForActor } from '../../projects/access/lockProjectForActor.js';
import { ProjectAccessResolver } from '../../projects/access/projectAccessResolver.js';
import { Project } from '../../projects/entities/project.entity.js';
import { WorkItemState } from '../../states/entities/workItemState.entity.js';
import { StateCatalog } from '../../states/stateCatalog.js';
import { WorkItem } from '../entities/workItem.entity.js';
import { WorkItemEvents } from '../events/workItemEvents.js';
import {
  WorkItemsRepository,
  type CreateWorkItemRepoInput,
  type CreateWorkItemRepoResult,
} from './workItems.repository.js';

@Injectable()
export class TypeOrmWorkItemsRepository implements WorkItemsRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: ProjectAccessResolver,
    private readonly events: WorkItemEvents,
    private readonly catalog: StateCatalog,
  ) {}

  async create(
    input: CreateWorkItemRepoInput,
  ): Promise<CreateWorkItemRepoResult> {
    return await runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        // Step 1 - 5: lockProjectForActor (packages/docs/21-state-work-item/3-database-spec.md DB B3.3)
        const locked = await lockProjectForActor(manager, this.resolver, {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          actorId: input.actorId,
          projectLock: 'for_no_key_update',
        });

        if (locked.kind === 'project_gone') {
          return { status: 'project_gone' };
        }
        if (locked.kind === 'actor_inactive') {
          return { status: 'actor_inactive' };
        }
        if (locked.kind === 'forbidden') {
          return { status: 'forbidden' };
        }

        if (!locked.access.permissions.includes('project.workitems.create')) {
          return { status: 'forbidden' };
        }

        // Step 6: Find work_items by (created_by_id = Actor, idempotency_key), all rows including deleted
        // (packages/docs/21-state-work-item/3-database-spec.md DB B3.3, RQ D25, INV-10)
        const existing = await manager.findOne(WorkItem, {
          where: {
            createdById: input.actorId,
            idempotencyKey: input.idempotencyKey,
          },
          withDeleted: true,
        });

        if (existing) {
          const sameContent =
            existing.title === input.title &&
            existing.description === input.description;
          if (
            existing.projectId === locked.project.id &&
            existing.deletedAt === null &&
            sameContent
          ) {
            return { status: 'replayed', workItem: existing };
          }
          return { status: 'key_reused' };
        }

        // Step 7: Resolve state (packages/docs/21-state-work-item/3-database-spec.md DB B3.3, RQ INV-09)
        let resolvedStateId: string;
        if (!input.stateId) {
          const defaultState = await manager.findOne(WorkItemState, {
            where: { defaultKey: INITIAL_STATE_KEY, deletedAt: IsNull() },
          });
          if (!defaultState) {
            return { status: 'state_unavailable' };
          }
          resolvedStateId = defaultState.id;
        } else {
          const effectiveState = await this.catalog.lockEffectiveState(
            manager,
            {
              workspaceId: input.workspaceId,
              projectId: locked.project.id,
              stateId: input.stateId,
            },
            'pessimistic_read',
          );
          if (!effectiveState) {
            return { status: 'state_unavailable' };
          }
          resolvedStateId = effectiveState.id;
        }

        // Step 8: n = last_work_item_number + 1; update ONLY last_work_item_number on project
        // (packages/docs/21-state-work-item/3-database-spec.md DB B3.3)
        const n = locked.project.lastWorkItemNumber + 1;
        await manager.update(
          Project,
          { id: locked.project.id },
          { lastWorkItemNumber: n },
        );

        // Step 9: Insert work_items (packages/docs/21-state-work-item/3-database-spec.md DB B3.3, RQ INV-18)
        const workItemId = crypto.randomUUID();
        const workItem = manager.create(WorkItem, {
          id: workItemId,
          workspaceId: input.workspaceId,
          projectId: locked.project.id,
          stateId: resolvedStateId,
          number: n,
          title: input.title,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          createdById: input.actorId,
          updatedById: null,
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        });
        await manager.insert(WorkItem, workItem);

        // Step 10: Commit -> created (packages/docs/21-state-work-item/3-database-spec.md DB B3.3)
        return { status: 'created', workItem };
      },
      {
        maxAttempts: 3,
        retryOnUnique: 'work_items_creator_idempotency_key',
        onRetry: (attempt) =>
          this.events.onTransactionRetry(attempt, input.projectId),
      },
    );
  }
}

