import type { EntityManager } from 'typeorm';
import type { ProjectAccess } from '@repo/contracts';
import { User } from '../../auth/entities/user.entity.js';
import { ACTIVE_USER } from '../../auth/repositories/usersRepository.js';
import { WorkspaceMember } from '../../workspaces/entities/workspaceMember.entity.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import { ACTIVE_PROJECT, ACTIVE_PROJECT_MEMBER } from '../projectFilters.js';
import type { ProjectAccessResolver } from './projectAccessResolver.js';

export type ProjectLockMode =
  'for_no_key_update' | 'pessimistic_read' | 'pessimistic_write';

export interface LockProjectForActorOptions {
  workspaceId: string;
  projectId: string;
  actorId: string;
  projectLock: ProjectLockMode;
}

export type LockProjectForActorResult =
  | { kind: 'ok'; project: Project; access: ProjectAccess }
  | { kind: 'project_gone' }
  | { kind: 'forbidden' }
  | { kind: 'actor_inactive' };

export async function lockProjectForActor(
  manager: EntityManager,
  resolver: ProjectAccessResolver,
  options: LockProjectForActorOptions,
): Promise<LockProjectForActorResult> {
  const { workspaceId, projectId, actorId, projectLock } = options;

  // Bước 1: Khoá dòng project
  const project = await manager.findOne(Project, {
    where: {
      ...ACTIVE_PROJECT,
      id: projectId,
      workspaceId,
    },
    lock: { mode: projectLock },
  });
  if (project === null) {
    return { kind: 'project_gone' };
  }

  // Bước 2: Khoá chia sẻ dòng workspace_members của Actor
  const workspaceMember = await manager.findOne(WorkspaceMember, {
    where: {
      workspaceId,
      memberId: actorId,
      isActive: true,
    },
    lock: { mode: 'pessimistic_read' },
  });
  if (workspaceMember === null) {
    return { kind: 'forbidden' };
  }

  // Bước 3: Khoá chia sẻ dòng project_members của Actor (có thể null: Workspace Admin)
  const projectMember = await manager.findOne(ProjectMember, {
    where: {
      ...ACTIVE_PROJECT_MEMBER,
      workspaceId,
      projectId,
      memberId: actorId,
    },
    lock: { mode: 'pessimistic_read' },
  });

  // Bước 4: Khoá chia sẻ dòng users của Actor, đòi tài khoản dùng được (ACTIVE_USER)
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

  // Bước 5: Quyết quyền bằng forMembership
  const access = await resolver.forMembership(manager, {
    workspaceRole: workspaceMember.role,
    assignedRole: projectMember?.role ?? null,
  });
  if (access === null) {
    return { kind: 'forbidden' };
  }

  return { kind: 'ok', project, access };
}
