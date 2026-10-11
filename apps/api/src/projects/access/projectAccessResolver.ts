import { Injectable } from '@nestjs/common';
import {
  PROJECT_LIST_MAX,
  PROJECT_ROLES,
  resolveProjectAccess,
  workspaceRolesWithImplicitProjectAccess,
  type ProjectAccess,
  type ProjectRole,
  type WorkspaceRole,
} from '@repo/contracts';
import { DataSource, In } from 'typeorm';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../roles/rolePermissionsQuery.js';
import type { ProjectRow } from '../dto/projectResponse.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import { ACTIVE_PROJECT, ACTIVE_PROJECT_MEMBER } from '../projectFilters.js';

export abstract class ProjectAccessResolver {
  /** Mọi project truy cập được trong workspace, mới nhất trước; tối đa PROJECT_LIST_MAX + 1 dòng. */
  abstract forWorkspace(input: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
  }): Promise<{ project: ProjectRow; access: ProjectAccess }[]>;
}

@Injectable()
export class TypeOrmProjectAccessResolver extends ProjectAccessResolver {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async forWorkspace(input: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
  }): Promise<{ project: ProjectRow; access: ProjectAccess }[]> {
    const { workspaceId, userId, workspaceRole } = input;
    const manager = this.dataSource.manager;

    // 1. Assigned project memberships
    const assigned = await manager.find(ProjectMember, {
      select: { projectId: true, role: true },
      where: {
        ...ACTIVE_PROJECT_MEMBER,
        workspaceId,
        memberId: userId,
      },
    });

    const assignedMap = new Map<string, ProjectRole>();
    for (const a of assigned) {
      assignedMap.set(a.projectId, a.role);
    }

    const hasImplicitAccess =
      workspaceRolesWithImplicitProjectAccess().includes(workspaceRole);

    let projects: Project[] = [];
    if (hasImplicitAccess) {
      projects = await manager.find(Project, {
        where: { ...ACTIVE_PROJECT, workspaceId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: PROJECT_LIST_MAX + 1,
      });
    } else {
      const projectIds = [...assignedMap.keys()];
      if (projectIds.length === 0) {
        return [];
      }
      projects = await manager.find(Project, {
        where: {
          ...ACTIVE_PROJECT,
          workspaceId,
          id: In(projectIds),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: PROJECT_LIST_MAX + 1,
      });
    }

    if (projects.length === 0) {
      return [];
    }

    // 3. Load project role permissions matrix once
    const permMap = await loadRolePermissions(
      manager,
      PROJECT_ROLES.map((key) => ({ scope: 'project', key })),
    );

    const matrix = {} as Record<ProjectRole, readonly string[]>;
    for (const roleKey of PROJECT_ROLES) {
      matrix[roleKey] =
        permMap.get(rolePermissionsKey('project', roleKey)) ?? [];
    }

    const results: { project: ProjectRow; access: ProjectAccess }[] = [];
    for (const p of projects) {
      const assignedRole = assignedMap.get(p.id) ?? null;
      const access = resolveProjectAccess(
        { workspaceRole, assignedRole },
        matrix,
      );
      if (access) {
        results.push({
          project: {
            id: p.id,
            name: p.name,
            identifier: p.identifier,
            description: p.description,
            iconName: p.iconName,
            iconColor: p.iconColor,
            coverKey: p.coverKey,
            createdAt: p.createdAt,
          },
          access,
        });
      }
    }

    return results;
  }
}
