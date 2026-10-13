import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  type Type,
  UseGuards,
} from '@nestjs/common';
import {
  ADD_PROJECT_MEMBERS_REQUIREMENT,
  type EnforcedProjectPermission,
  type EnforcedWorkspacePermission,
} from '@repo/contracts';
import type { Request } from 'express';
import { WORKSPACE_PERMISSION_KEY } from '../../workspaces/workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from '../../workspaces/workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from '../../workspaces/workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from '../../workspaces/workspaceWriteRateLimitGuard.js';
import { withCandidateRateLimit } from '../../workspaces/members/memberCandidateSearch.decorator.js';
import { ProjectAccessGuard } from './projectAccessGuard.js';
import type { AccessibleProject } from './projectAccessResolver.js';
import {
  PROJECT_PERMISSION_KEY,
  ProjectPermissionGuard,
} from './projectPermissionGuard.js';

export type ProjectRequirement =
  | EnforcedProjectPermission
  | { workspace: EnforcedWorkspacePermission }
  | {
      project: EnforcedProjectPermission;
      workspace: EnforcedWorkspacePermission;
    };

export type ProjectWriteRequirement = ProjectRequirement;

export interface ProjectGuardsDefinition {
  guards: Type<CanActivate>[];
  projectPermission?: EnforcedProjectPermission;
  workspacePermission?: EnforcedWorkspacePermission;
}

/**
 * Returns guards and permission metadata for reading a project route.
 * Reused by ProjectRead, ProjectWrite and ProjectMemberCandidateSearch.
 */
export function projectReadGuards(
  requirement?: ProjectRequirement,
): ProjectGuardsDefinition {
  const guards: Type<CanActivate>[] = [
    WorkspaceMemberGuard,
    ProjectAccessGuard,
  ];
  let projectPermission: EnforcedProjectPermission | undefined;
  let workspacePermission: EnforcedWorkspacePermission | undefined;

  if (requirement !== undefined) {
    if (typeof requirement === 'string') {
      projectPermission = requirement;
      guards.push(ProjectPermissionGuard);
    } else if ('project' in requirement && 'workspace' in requirement) {
      projectPermission = requirement.project;
      workspacePermission = requirement.workspace;
      guards.push(ProjectPermissionGuard, WorkspacePermissionGuard);
    } else if ('workspace' in requirement) {
      workspacePermission = requirement.workspace;
      guards.push(WorkspacePermissionGuard);
    }
  }

  return { guards, projectPermission, workspacePermission };
}

function toDecorators(
  def: ProjectGuardsDefinition,
  leadingGuards: Type<CanActivate>[] = [],
): (ClassDecorator | MethodDecorator | PropertyDecorator)[] {
  const decorators: (ClassDecorator | MethodDecorator | PropertyDecorator)[] =
    [];
  if (def.projectPermission !== undefined) {
    decorators.push(SetMetadata(PROJECT_PERMISSION_KEY, def.projectPermission));
  }
  if (def.workspacePermission !== undefined) {
    decorators.push(
      SetMetadata(WORKSPACE_PERMISSION_KEY, def.workspacePermission),
    );
  }
  decorators.push(UseGuards(...leadingGuards, ...def.guards));
  return decorators;
}

/**
 * Every read under /api/workspaces/:slug/projects/:identifier uses this, so
 * the project access check (and its guard order) lives in one place.
 * Without a permission, any viewer who can access the project passes.
 */
export function ProjectRead(
  requirement?: ProjectRequirement,
): MethodDecorator {
  return applyDecorators(...toDecorators(projectReadGuards(requirement)));
}

/** Every write under /api/workspaces/:slug/projects/:identifier uses this. */
export function ProjectWrite(
  requirement: ProjectRequirement,
): MethodDecorator {
  return applyDecorators(
    ...toDecorators(projectReadGuards(requirement), [
      WorkspaceWriteRateLimitGuard,
    ]),
  );
}

/**
 * Route decorator for searching project member candidates.
 * Rate limit runs FIRST before workspace and project membership/permission checks.
 */
export function ProjectMemberCandidateSearch(): MethodDecorator {
  const def = projectReadGuards(ADD_PROJECT_MEMBERS_REQUIREMENT);
  return applyDecorators(
    ...toDecorators({
      ...def,
      guards: withCandidateRateLimit(def.guards),
    }),
  );
}

/** The project opened by ProjectAccessGuard (via ProjectRead / ProjectWrite). */
export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessibleProject => {
    const project = ctx.switchToHttp().getRequest<Request>().project;
    if (project === undefined) {
      throw new Error(
        'CurrentProject used on a route without ProjectRead/ProjectWrite',
      );
    }
    return project;
  },
);
