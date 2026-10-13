import {
  type EntityManager,
  type FindOptionsWhere,
  IsNull,
  type SelectQueryBuilder,
} from 'typeorm';
import { User } from '../auth/entities/user.entity.js';
import { WorkspaceMember } from '../workspaces/entities/workspaceMember.entity.js';
import type { Project } from './entities/project.entity.js';
import { ProjectMember } from './entities/projectMember.entity.js';

export const ACTIVE_PROJECT: FindOptionsWhere<Project> = {
  deletedAt: IsNull(),
};

export const ACTIVE_PROJECT_MEMBER: FindOptionsWhere<ProjectMember> = {
  isActive: true,
};

/**
 * Project members of the given projects: active project row AND active
 * workspace membership. Joined to the user. Callers add select/order.
 */
export function projectMembersQuery(
  manager: EntityManager,
  where: FindOptionsWhere<ProjectMember>,
): SelectQueryBuilder<ProjectMember> {
  return manager
    .createQueryBuilder(ProjectMember, 'pm')
    .innerJoin(
      WorkspaceMember,
      'wm',
      'wm.workspaceId = pm.workspaceId AND wm.memberId = pm.memberId',
    )
    .innerJoin(User, 'u', 'u.id = pm.memberId')
    .where(where)
    .andWhere('pm.isActive = true')
    .andWhere('wm.isActive = true');
}

