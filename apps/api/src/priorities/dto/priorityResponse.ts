import type { PriorityResponse } from '@repo/contracts';
import type { WorkItemPriority } from '../entities/workItemPriority.entity.js';

export function toPriorityResponse(row: WorkItemPriority): PriorityResponse {
  return {
    id: row.id,
    name: row.name,
    band: row.band,
    color: row.color,
    level: row.level,
    defaultKey: row.level === 'default' ? row.defaultKey : null,
  };
}
