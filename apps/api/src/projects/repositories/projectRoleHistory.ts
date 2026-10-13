import type { ProjectRole } from '@repo/contracts';
import type { EntityManager } from 'typeorm';
import {
  ProjectMemberRoleHistory,
  type ProjectRoleChangeType,
} from '../entities/projectMemberRoleHistory.entity.js';

export type { ProjectRoleChangeType };

export interface ProjectRoleHistoryEntry {
  workspaceId: string;
  projectId: string;
  memberId: string;
  fromRole: ProjectRole | null;
  toRole: ProjectRole | null;
  changeType: ProjectRoleChangeType;
  actorId: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Ghi trong transaction của người gọi. Không bao giờ tự mở transaction.
 * Bảng chỉ ghi thêm: entity mang @AppendOnly(), mọi update/delete qua TypeORM bị chặn.
 */
export async function recordProjectRoleChanges(
  manager: EntityManager,
  entries: readonly ProjectRoleHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await manager.insert(
    ProjectMemberRoleHistory,
    entries.map((e) => ({
      workspaceId: e.workspaceId,
      projectId: e.projectId,
      memberId: e.memberId,
      roleScope: 'project' as const,
      fromRole: e.fromRole,
      toRole: e.toRole,
      changeType: e.changeType,
      actorId: e.actorId,
      requestId: e.requestId,
      createdAt: e.createdAt,
    })),
  );
}
