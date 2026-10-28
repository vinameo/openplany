import { HttpStatus, Injectable } from '@nestjs/common';
import type { WorkItemResponse } from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import type { AccessibleProject } from '../projects/access/projectAccessResolver.js';
import { toWorkItemResponse } from './dto/workItemResponse.js';
import { WorkItemEvents } from './events/workItemEvents.js';
import { WorkItemsRepository } from './repositories/workItems.repository.js';

export interface CreateWorkItemServiceInput {
  workspaceId: string;
  project: AccessibleProject;
  actorId: string;
  title: string;
  description: string;
  idempotencyKey: string;
  requestId?: string;
}

export interface CreateWorkItemServiceResult {
  outcome: 'created' | 'replayed';
  workItem: WorkItemResponse;
}

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly repository: WorkItemsRepository,
    private readonly events: WorkItemEvents,
    private readonly clock: Clock,
  ) {}

  async create(
    input: CreateWorkItemServiceInput,
  ): Promise<CreateWorkItemServiceResult> {
    const now = this.clock.now();
    const result = await this.repository.create({
      workspaceId: input.workspaceId,
      projectId: input.project.project.id,
      actorId: input.actorId,
      title: input.title,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      now,
    });

    switch (result.status) {
      case 'created':
        this.events.onWorkItemCreated({
          workItemId: result.workItem.id,
          projectId: input.project.project.id,
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          number: result.workItem.number,
          requestId: input.requestId,
        });
        return {
          outcome: 'created',
          workItem: toWorkItemResponse(
            result.workItem,
            input.project.project.identifier,
          ),
        };

      case 'replayed':
        this.events.onWorkItemReplayed({
          workItemId: result.workItem.id,
          projectId: input.project.project.id,
          actorId: input.actorId,
          requestId: input.requestId,
        });
        return {
          outcome: 'replayed',
          workItem: toWorkItemResponse(
            result.workItem,
            input.project.project.identifier,
          ),
        };

      case 'project_gone':
        throw new ApiException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', {
          key: 'project:errors.notFound',
        });

      case 'forbidden':
        this.events.onWorkItemForbidden(
          input.project.project.id,
          input.actorId,
          input.requestId,
        );
        throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
          key: 'errors:forbidden',
        });

      case 'actor_inactive':
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
          key: 'errors:http.unauthenticated',
        });

      case 'key_reused':
        this.events.onWorkItemKeyReused(
          input.project.project.id,
          input.actorId,
          input.requestId,
        );
        throw new ApiException(
          HttpStatus.CONFLICT,
          'WORK_ITEM_REQUEST_REUSED',
          {
            key: 'workItem:errors.requestReused',
          },
        );
    }
  }
}