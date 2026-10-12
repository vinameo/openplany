import { Injectable } from '@nestjs/common';
import {
  PROJECT_LIST_MAX,
  PROJECT_ROLES,
  resolveProjectAccess,
  workspaceRolesWithImplicitProjectAccess,
  type ProjectAccess,
  type ProjectRole,
  type ProjectRolePermissions,
  type WorkspaceRole,
} from '@repo/contracts';
import {
  DataSource,
  In,
  type EntityManager,
  type FindOptionsWhere,
} from 'typeorm';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../roles/rolePermissionsQuery.js';
import { toProjectRow, type ProjectRow } from '../dto/projectResponse.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import { ACTIVE_PROJECT, ACTIVE_PROJECT_MEMBER } from '../projectFilters.js';

export interface ProjectViewer {
  workspaceId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
}

export interface AccessibleProject {
  project: ProjectRow;
  access: ProjectAccess;
}

export interface AccessibleProjectList {
  /** Newest first, at most PROJECT_LIST_MAX. */
  projects: AccessibleProject[];
  /** Every project the viewer can access, including those past PROJECT_LIST_MAX. */
  total: number;
}

/**
 * Outcome of opening a project by its Project ID. `forbidden` means the
 * project exists in the workspace but the viewer cannot access it (RQ D11).
 */
export type ProjectLookup =
  | { kind: 'not_found' }
  | { kind: 'forbidden'; projectId: string }
  | { kind: 'accessible'; project: AccessibleProject };

/**
 * The single place that decides which projects a viewer can access (DB B5.1).
 * Public projects / self-join will extend `accessScope` only; list and single
 * project lookups share it, so they can never disagree.
 */
export abstract class ProjectAccessResolver {
  abstract forWorkspace(viewer: ProjectViewer): Promise<AccessibleProjectList>;

  /** One project, or null when it does not exist or the viewer cannot access it. */
  abstract forProject(
    viewer: ProjectViewer & { projectId: string },
  ): Promise<AccessibleProject | null>;

  /**
   * One active project by its exact Project ID. Existence and access are
   * decided on the same row, so a project can never be both missing and
   * forbidden within one lookup.
   */
  abstract forIdentifier(
    viewer: ProjectViewer & { identifier: string },
  ): Promise<ProjectLookup>;
}

interface AccessScope {
  where: FindOptionsWhere<Project>;
  assignedRoles: ReadonlyMap<string, ProjectRole>;
}

@Injectable()
export class TypeOrmProjectAccessResolver extends ProjectAccessResolver {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async forWorkspace(viewer: ProjectViewer): Promise<AccessibleProjectList> {
    const manager = this.dataSource.manager;
    const scope = await accessScope(manager, viewer);
    if (scope === null) return { projects: [], total: 0 };

    const projects = await manager.find(Project, {
      where: scope.where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: PROJECT_LIST_MAX,
    });
    const total =
      projects.length < PROJECT_LIST_MAX
        ? projects.length
        : await manager.count(Project, { where: scope.where });
    if (projects.length === 0) return { projects: [], total };

    const matrix = await loadProjectRoleMatrix(manager);
    return {
      projects: projects.flatMap((project) =>
        toAccessibleProject(project, viewer, scope, matrix),
      ),
      total,
    };
  }

  async forProject(
    viewer: ProjectViewer & { projectId: string },
  ): Promise<AccessibleProject | null> {
    const manager = this.dataSource.manager;
    const scope = await accessScope(manager, viewer, viewer.projectId);
    if (scope === null) return null;

    const project = await manager.findOne(Project, {
      where: { ...scope.where, id: viewer.projectId },
    });
    if (project === null) return null;

    const matrix = await loadProjectRoleMatrix(manager);
    return toAccessibleProject(project, viewer, scope, matrix)[0] ?? null;
  }

  async forIdentifier(
    viewer: ProjectViewer & { identifier: string },
  ): Promise<ProjectLookup> {
    const manager = this.dataSource.manager;
    const project = await manager.findOne(Project, {
      where: {
        ...ACTIVE_PROJECT,
        workspaceId: viewer.workspaceId,
        identifier: viewer.identifier,
      },
    });
    if (project === null) return { kind: 'not_found' };

    const scope = await accessScope(manager, viewer, project.id);
    if (scope === null) return { kind: 'forbidden', projectId: project.id };

    const matrix = await loadProjectRoleMatrix(manager);
    const [accessible] = toAccessibleProject(project, viewer, scope, matrix);
    return accessible === undefined
      ? { kind: 'forbidden', projectId: project.id }
      : { kind: 'accessible', project: accessible };
  }
}

/**
 * Projects the viewer can see: every project of the workspace for roles with
 * implicit access, otherwise only projects with an active membership.
 * Returns null when the viewer can see none (no query needed).
 */
async function accessScope(
  manager: EntityManager,
  viewer: ProjectViewer,
  projectId?: string,
): Promise<AccessScope | null> {
  const memberships = await manager.find(ProjectMember, {
    select: { projectId: true, role: true },
    where: {
      ...ACTIVE_PROJECT_MEMBER,
      workspaceId: viewer.workspaceId,
      memberId: viewer.userId,
      ...(projectId === undefined ? {} : { projectId }),
    },
  });
  const assignedRoles = new Map<string, ProjectRole>(
    memberships.map((m) => [m.projectId, m.role]),
  );

  const base: FindOptionsWhere<Project> = {
    ...ACTIVE_PROJECT,
    workspaceId: viewer.workspaceId,
  };
  if (
    workspaceRolesWithImplicitProjectAccess().includes(viewer.workspaceRole)
  ) {
    return { where: base, assignedRoles };
  }
  if (assignedRoles.size === 0) return null;
  return {
    where: { ...base, id: In([...assignedRoles.keys()]) },
    assignedRoles,
  };
}

async function loadProjectRoleMatrix(
  manager: EntityManager,
): Promise<ProjectRolePermissions> {
  const granted = await loadRolePermissions(
    manager,
    PROJECT_ROLES.map((key) => ({ scope: 'project', key })),
  );
  const matrix = {} as Record<ProjectRole, readonly string[]>;
  for (const role of PROJECT_ROLES) {
    matrix[role] = granted.get(rolePermissionsKey('project', role)) ?? [];
  }
  return matrix;
}

/** Empty when the viewer has no project role there (kept as a list for flatMap). */
function toAccessibleProject(
  project: Project,
  viewer: ProjectViewer,
  scope: AccessScope,
  matrix: ProjectRolePermissions,
): AccessibleProject[] {
  const access = resolveProjectAccess(
    {
      workspaceRole: viewer.workspaceRole,
      assignedRole: scope.assignedRoles.get(project.id) ?? null,
    },
    matrix,
  );
  if (access === null) return [];
  return [
    {
      project: toProjectRow(project),
      access,
    },
  ];
}
