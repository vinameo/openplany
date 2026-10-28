import { workItemKey, type WorkItemResponse } from '@repo/contracts';
import type { WorkItem } from '../entities/workItem.entity.js';

export function toWorkItemResponse(
  row: WorkItem,
  projectIdentifier: string,
): WorkItemResponse {
  return {
    id: row.id,
    number: row.number,
    key: workItemKey(projectIdentifier, row.number),
    title: row.title,
    description: row.description,
    stateId: row.stateId,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}

