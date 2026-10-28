import { IsNull, type FindOptionsWhere } from 'typeorm';
import type { WorkItemState } from './entities/workItemState.entity.js';

export const LIVE_STATE = { deletedAt: IsNull() } as const;

export const DEFAULT_STATES: FindOptionsWhere<WorkItemState> = {
  level: 'default',
  deletedAt: IsNull(),
};

export function ownWorkspaceStates(
  workspaceId: string,
): FindOptionsWhere<WorkItemState> {
  return {
    level: 'workspace',
    workspaceId,
    deletedAt: IsNull(),
  };
}

export function ownProjectStates(
  projectId: string,
): FindOptionsWhere<WorkItemState> {
  return {
    level: 'project',
    projectId,
    deletedAt: IsNull(),
  };
}
