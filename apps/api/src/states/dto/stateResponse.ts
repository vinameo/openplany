import type { StateResponse } from '@repo/contracts';
import type { WorkItemState } from '../entities/workItemState.entity.js';

export function toStateResponse(
  row: WorkItemState,
  count?: number,
): StateResponse {
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    color: row.color,
    level: row.level,
    ...(count !== undefined && { workItemCount: count }),
  };
}
