import type { WorkspaceRole } from '@repo/contracts';
import type { EntityManager } from 'typeorm';

export type WorkspaceRoleChangeType =
  'workspace_created' | 'member_added' | 'role_changed' | 'member_removed';

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
 * Cố ý không có entity cho bảng này (DB-14): không ai `save()`/`remove()` được sổ.
 */
export async function recordWorkspaceRoleChanges(
  manager: EntityManager,
  entries: readonly WorkspaceRoleHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  await manager
    .createQueryBuilder()
    .insert()
    .into('workspace_member_role_history', [
      'workspace_id',
      'member_id',
      'from_role',
      'to_role',
      'change_type',
      'actor_id',
      'request_id',
      'created_at',
    ])
    .values(
      entries.map((e) => ({
        workspace_id: e.workspaceId,
        member_id: e.memberId,
        from_role: e.fromRole,
        to_role: e.toRole,
        change_type: e.changeType,
        actor_id: e.actorId,
        request_id: e.requestId,
        created_at: e.at,
      })),
    )
    .execute();
}
