import type { WorkspaceRole } from '@repo/contracts';
import type { EntityManager } from 'typeorm';

export type WorkspaceRoleChangeType =
  | 'workspace_created'
  | 'member_added'
  | 'role_changed'
  | 'member_removed';

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

/** Ghi trong transaction của người gọi. Không bao giờ tự mở transaction. */
export async function recordWorkspaceRoleChanges(
  manager: EntityManager,
  entries: readonly WorkspaceRoleHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const workspaceIds = entries.map((e) => e.workspaceId);
  const memberIds = entries.map((e) => e.memberId);
  const fromRoles = entries.map((e) => e.fromRole);
  const toRoles = entries.map((e) => e.toRole);
  const changeTypes = entries.map((e) => e.changeType);
  const actorIds = entries.map((e) => e.actorId);
  const requestIds = entries.map((e) => e.requestId);
  const ats = entries.map((e) => e.at);

  await manager.query(
    `INSERT INTO workspace_member_role_history
      (workspace_id, member_id, from_role, to_role, change_type, actor_id, request_id, created_at)
    SELECT * FROM unnest(
      $1::uuid[], $2::uuid[], $3::varchar[], $4::varchar[],
      $5::varchar[], $6::uuid[], $7::varchar[], $8::timestamptz[]
    )`,
    [
      workspaceIds,
      memberIds,
      fromRoles,
      toRoles,
      changeTypes,
      actorIds,
      requestIds,
      ats,
    ],
  );
}
