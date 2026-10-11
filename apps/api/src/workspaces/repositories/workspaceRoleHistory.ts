import type { WorkspaceRole } from '@repo/contracts';
import type { EntityManager } from 'typeorm';
import {
  WorkspaceMemberRoleHistory,
  type WorkspaceRoleChangeType,
} from '../entities/workspaceMemberRoleHistory.entity.js';

export type { WorkspaceRoleChangeType };

export interface WorkspaceRoleHistoryEntry {
  workspaceId: string;
  memberId: string;
  fromRole: WorkspaceRole | null;
  toRole: WorkspaceRole | null;
  changeType: WorkspaceRoleChangeType;
  actorId: string | null;
  requestId: string | null;
  at: Date;
}

/**
 * Ghi trong transaction của người gọi. Không bao giờ tự mở transaction.
 * Bảng chỉ ghi thêm: entity mang @AppendOnly(), mọi update/delete qua TypeORM bị chặn.
 */
export async function recordWorkspaceRoleChanges(
  manager: EntityManager,
  entries: readonly WorkspaceRoleHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await manager.insert(
    WorkspaceMemberRoleHistory,
    entries.map((e) => ({
      workspaceId: e.workspaceId,
      memberId: e.memberId,
      fromRole: e.fromRole,
      toRole: e.toRole,
      changeType: e.changeType,
      actorId: e.actorId,
      requestId: e.requestId,
      createdAt: e.at,
    })),
  );
}
