import type { WorkItem } from '../entities/workItem.entity.js';

export interface CreateWorkItemRepoInput {
  workspaceId: string;
  projectId: string;
  actorId: string;
  title: string;
  description: string;
  idempotencyKey: string;
  stateId?: string;
  priorityId?: string;
  now: Date;
}

export type CreateWorkItemRepoResult =
  | { status: 'created'; workItem: WorkItem }
  | { status: 'replayed'; workItem: WorkItem }
  | { status: 'project_gone' }
  | { status: 'forbidden' }
  | { status: 'actor_inactive' }
  | { status: 'key_reused' }
  | { status: 'state_unavailable' }
  | { status: 'priority_unavailable' }
  | { status: 'initial_priority_missing' };

export abstract class WorkItemsRepository {
  abstract create(
    input: CreateWorkItemRepoInput,
  ): Promise<CreateWorkItemRepoResult>;
}
