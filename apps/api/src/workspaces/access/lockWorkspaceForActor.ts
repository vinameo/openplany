import type { EntityManager } from 'typeorm';
import { IsNull } from 'typeorm';
import {
  enforcedWorkspacePermissions,
  parseWorkspacePermissions,
  type EnforcedWorkspacePermission,
} from '@repo/contracts';
import { User } from '../../auth/entities/user.entity.js';
import { ACTIVE_USER } from '../../auth/repositories/usersRepository.js';
import { Workspace } from '../entities/workspace.entity.js';
import { WorkspaceMember } from '../entities/workspaceMember.entity.js';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../roles/rolePermissionsQuery.js';

export type WorkspaceLockMode =
  'for_no_key_update' | 'pessimistic_read' | 'pessimistic_write';

export interface LockWorkspaceForActorOptions {
  workspaceId: string;
  actorId: string;
  workspaceLock?: WorkspaceLockMode;
  requiredPermission?:
    EnforcedWorkspacePermission | readonly EnforcedWorkspacePermission[];
}

export type LockWorkspaceForActorResult =
  | {
      kind: 'ok';
      workspace: Workspace;
      member: WorkspaceMember;
      permissions: EnforcedWorkspacePermission[];
    }
  | { kind: 'workspace_gone' }
  | { kind: 'forbidden' }
  | { kind: 'actor_inactive' };

export async function lockWorkspaceForActor(
  manager: EntityManager,
  options: LockWorkspaceForActorOptions,
): Promise<LockWorkspaceForActorResult> {
  const {
    workspaceId,
    actorId,
    workspaceLock = 'pessimistic_read',
    requiredPermission,
  } = options;

  // Bước 1: Khoá chia sẻ dòng workspace còn sống
  const workspace = await manager.findOne(Workspace, {
    where: {
      id: workspaceId,
      deletedAt: IsNull(),
    },
    lock: { mode: workspaceLock },
  });
  if (workspace === null) {
    return { kind: 'workspace_gone' };
  }

  // Bước 2: Khoá chia sẻ dòng thành viên đang hoạt động của Actor
  const member = await manager.findOne(WorkspaceMember, {
    where: {
      workspaceId,
      memberId: actorId,
      isActive: true,
    },
    lock: { mode: 'pessimistic_read' },
  });
  if (member === null) {
    return { kind: 'forbidden' };
  }

  // Bước 3: Khoá chia sẻ dòng users của Actor theo ACTIVE_USER
  const actor = await manager.findOne(User, {
    where: {
      ...ACTIVE_USER,
      id: actorId,
    },
    lock: { mode: 'pessimistic_read' },
  });
  if (actor === null) {
    return { kind: 'actor_inactive' };
  }

  // Bước 4: Lấy quyền qua loadRolePermissions + parseWorkspacePermissions + enforcedWorkspacePermissions
  const rolePerms = await loadRolePermissions(manager, [
    { scope: 'workspace', key: member.role },
  ]);
  const granted =
    rolePerms.get(rolePermissionsKey('workspace', member.role)) ?? [];
  const permissions = enforcedWorkspacePermissions(
    parseWorkspacePermissions(granted),
  );

  if (requiredPermission !== undefined) {
    const requiredList = Array.isArray(requiredPermission)
      ? requiredPermission
      : [requiredPermission];
    const hasAll = requiredList.every((p) => permissions.includes(p));
    if (!hasAll) {
      return { kind: 'forbidden' };
    }
  }

  return { kind: 'ok', workspace, member, permissions };
}
