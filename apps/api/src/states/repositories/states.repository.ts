import type { StateGroup } from '@repo/contracts';
import type { WorkItemState } from '../entities/workItemState.entity.js';
import type { StateScope } from '../stateCatalog.js';

export interface CreateStateRepoInput {
  scope: StateScope;
  actorId: string;
  name: string;
  group: StateGroup;
  color: string;
  now: Date;
}

export type CreateStateRepoResult =
  | { status: 'created'; state: WorkItemState }
  | { status: 'workspace_gone' }
  | { status: 'project_gone' }
  | { status: 'forbidden' }
  | { status: 'actor_inactive' }
  | { status: 'limit_reached' }
  | { status: 'name_taken' }
  | { status: 'name_taken_in_projects'; count: number };

export interface UpdateStateRepoInput {
  scope: StateScope;
  actorId: string;
  stateId: string;
  name?: string;
  group?: StateGroup;
  color?: string;
  confirmGroupChange?: boolean;
  now: Date;
}

export type UpdateStateRepoResult =
  | {
      status: 'updated';
      state: WorkItemState;
      count: number;
      changed: ('name' | 'group' | 'color')[];
    }
  | { status: 'workspace_gone' }
  | { status: 'project_gone' }
  | { status: 'forbidden' }
  | { status: 'actor_inactive' }
  | { status: 'not_found' }
  | { status: 'name_taken' }
  | { status: 'name_taken_in_projects'; count: number }
  | { status: 'group_change_unconfirmed'; count: number };

export abstract class StatesRepository {
  abstract create(input: CreateStateRepoInput): Promise<CreateStateRepoResult>;
  abstract update(input: UpdateStateRepoInput): Promise<UpdateStateRepoResult>;
}
