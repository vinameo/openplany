import { Injectable, Logger } from '@nestjs/common';
import {
  hasImplicitProjectAccess,
  isProjectRoleOutOfRange,
  PROJECT_LIST_MAX,
  PROJECT_ROLES,
  resolveProjectAccess,
  type ProjectAccess,
  type ProjectAccessInput,
  type ProjectAccessPolicies,
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
import { ProjectAccessPolicyStore } from '../../roles/projectAccessPolicyStore.js';
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

  /**
   * Access from membership rows the caller already read, and locked, with
   * `manager` inside its own transaction. A write that re-checks access after
   * taking its locks calls this instead of deciding access itself, so it can
   * never disagree with the guard that let the request in.
   */
  abstract forMembership(
    manager: EntityManager,
    membership: ProjectAccessInput,
  ): Promise<ProjectAccess | null>;

  /**
   * Filters candidate project IDs down to those the viewer can access (API B2.3, BA ADR-05).
   * Implicit access roles see all live workspace projects; others only projects with active membership.
   */
  abstract filterAccessible(
    viewer: ProjectViewer,
    projectIds: readonly string[],
  ): Promise<Set<string>>;
}

interface AccessScope {
  where: FindOptionsWhere<Project>;
  assignedRoles: ReadonlyMap<string, ProjectRole>;
}

@Injectable()
export class TypeOrmProjectAccessResolver extends ProjectAccessResolver {
  private readonly logger = new Logger(TypeOrmProjectAccessResolver.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly policyStore: ProjectAccessPolicyStore,
  ) {
    super();
  }

  async forWorkspace(viewer: ProjectViewer): Promise<AccessibleProjectList> {
    const policies = this.policyStore.policies();
    const manager = this.dataSource.manager;
    const scope = await accessScope(manager, viewer, policies);
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

    let outOfRangeCount = 0;
    for (const project of projects) {
      const assignedRole = scope.assignedRoles.get(project.id) ?? null;
      if (
        isProjectRoleOutOfRange(
          { workspaceRole: viewer.workspaceRole, assignedRole },
          policies,
        )
      ) {
        outOfRangeCount++;
      }
    }
    if (outOfRangeCount > 0) {
      this.logger.warn(
        `project.role.out_of_range userId=${viewer.userId} workspaceRole=${viewer.workspaceRole} count=${outOfRangeCount}`,
      );
    }

    const matrix = await loadProjectRoleMatrix(manager);
    return {
      projects: projects.flatMap((project) =>
        toAccessibleProject(project, viewer, scope, policies, matrix),
      ),
      total,
    };
  }

  async forProject(
    viewer: ProjectViewer & { projectId: string },
  ): Promise<AccessibleProject | null> {
    const policies = this.policyStore.policies();
    const manager = this.dataSource.manager;
    const scope = await accessScope(
      manager,
      viewer,
      policies,
      viewer.projectId,
    );
    if (scope === null) return null;

    const project = await manager.findOne(Project, {
      where: { ...scope.where, id: viewer.projectId },
    });
    if (project === null) return null;

    const assignedRole = scope.assignedRoles.get(project.id) ?? null;
    if (
      isProjectRoleOutOfRange(
        { workspaceRole: viewer.workspaceRole, assignedRole },
        policies,
      )
    ) {
      this.logger.warn(
        `project.role.out_of_range userId=${viewer.userId} workspaceRole=${viewer.workspaceRole} count=1 projectId=${project.id}`,
      );
    }

    const matrix = await loadProjectRoleMatrix(manager);
    return (
      toAccessibleProject(project, viewer, scope, policies, matrix)[0] ?? null
    );
  }

  async forIdentifier(
    viewer: ProjectViewer & { identifier: string },
  ): Promise<ProjectLookup> {
    const policies = this.policyStore.policies();
    const manager = this.dataSource.manager;
    const project = await manager.findOne(Project, {
      where: {
        ...ACTIVE_PROJECT,
        workspaceId: viewer.workspaceId,
        identifier: viewer.identifier,
      },
    });
    if (project === null) return { kind: 'not_found' };

    const scope = await accessScope(manager, viewer, policies, project.id);
    if (scope === null) return { kind: 'forbidden', projectId: project.id };

    const assignedRole = scope.assignedRoles.get(project.id) ?? null;
    if (
      isProjectRoleOutOfRange(
        { workspaceRole: viewer.workspaceRole, assignedRole },
        policies,
      )
    ) {
      this.logger.warn(
        `project.role.out_of_range userId=${viewer.userId} workspaceRole=${viewer.workspaceRole} count=1 projectId=${project.id}`,
      );
    }

    const matrix = await loadProjectRoleMatrix(manager);
    const [accessible] = toAccessibleProject(
      project,
      viewer,
      scope,
      policies,
      matrix,
    );
    return accessible === undefined
      ? { kind: 'forbidden', projectId: project.id }
      : { kind: 'accessible', project: accessible };
  }

  async forMembership(
    manager: EntityManager,
    membership: ProjectAccessInput,
  ): Promise<ProjectAccess | null> {
    return resolveProjectAccess(
      membership,
      this.policyStore.policies(),
      await loadProjectRoleMatrix(manager),
    );
  }

  async filterAccessible(
    viewer: ProjectViewer,
    projectIds: readonly string[],
  ): Promise<Set<string>> {
    if (projectIds.length === 0) return new Set();

    const policies = this.policyStore.policies();
    const manager = this.dataSource.manager;
    const scope = await accessScope(manager, viewer, policies);
    if (scope === null) return new Set();

    const candidateIds = hasImplicitProjectAccess(
      policies[viewer.workspaceRole],
    )
      ? [...new Set(projectIds)]
      : [...new Set(projectIds.filter((id) => scope.assignedRoles.has(id)))];

    if (candidateIds.length === 0) return new Set();

    const accessible = await manager.find(Project, {
      select: { id: true },
      where: {
        ...ACTIVE_PROJECT,
        workspaceId: viewer.workspaceId,
        id: In(candidateIds),
      },
    });

    return new Set(accessible.map((p) => p.id));
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
  policies: ProjectAccessPolicies,
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
  if (hasImplicitProjectAccess(policies[viewer.workspaceRole])) {
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
  policies: ProjectAccessPolicies,
  matrix: ProjectRolePermissions,
): AccessibleProject[] {
  const access = resolveProjectAccess(
    {
      workspaceRole: viewer.workspaceRole,
      assignedRole: scope.assignedRoles.get(project.id) ?? null,
    },
    policies,
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
