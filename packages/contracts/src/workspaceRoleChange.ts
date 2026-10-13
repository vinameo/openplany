import type { WorkspaceRole } from './workspace.js';
import type { ProjectRole } from './projectRoles.js';
import type {
  ProjectAccessPolicies,
  ProjectAccessPolicy,
} from './projectAccessPolicy.js';
import {
  assignableRangeOf,
  hasImplicitProjectAccess,
} from './projectAccessPolicy.js';
import type { WorkspaceMemberResponse } from './workspaceMembers.js';

export type WorkspaceRoleChangeEffect =
  | 'gain_implicit'
  | 'lose_implicit'
  | 'apply_project_role'
  | 'no_projects';

export interface WorkspaceRoleChangePlanInput {
  actor: { workspaceRole: WorkspaceRole };
  fromRole: WorkspaceRole;
  toRole: WorkspaceRole;
  liveProjectCount: number; // dòng của project còn sống (D19)
}

export interface WorkspaceRoleChangePlan {
  effect: WorkspaceRoleChangeEffect;
  projectRoleChoices: ProjectRole[]; // [] khi effect ≠ 'apply_project_role'
  defaultProjectRole: ProjectRole | null; // sàn của vai trò mới khi vai trò mới không ngầm định; null khi ngầm định
  actorCanChooseProjectRole: boolean; // D4
}

export interface ProjectRef {
  id: string;
  name: string;
  identifier: string;
}

/** projects ≤ 10, chỉ project actor vào được; total = mọi project trong tập; hiddenCount = số actor không vào được.
 *  "and {M} more" với M = total − projects.length − hiddenCount. */
export interface BoundedProjectList {
  projects: ProjectRef[];
  total: number;
  hiddenCount: number;
}

export interface WorkspaceRoleChangePreview {
  userId: string;
  fromRole: WorkspaceRole;
  toRole: WorkspaceRole;
  effect: WorkspaceRoleChangeEffect;
  affectedProjects: BoundedProjectList;
  projectsLosingAssignedAdmin: BoundedProjectList;
  projectRoleChoices: ProjectRole[];
  defaultProjectRole: ProjectRole | null;
  actorCanChooseProjectRole: boolean;
}

export interface ChangeWorkspaceRoleRequest {
  fromRole: WorkspaceRole;
  role: WorkspaceRole;
  projectRole?: ProjectRole | null;
}

export interface ChangeWorkspaceRoleResponse {
  member: WorkspaceMemberResponse;
  effect: WorkspaceRoleChangeEffect;
  appliedProjectCount: number;
}

export const ROLE_CHANGE_PREVIEW_PROJECTS_MAX = 10;

export function planWorkspaceRoleChange(
  input: WorkspaceRoleChangePlanInput,
  policies: ProjectAccessPolicies,
): WorkspaceRoleChangePlan {
  const fromPolicy = policies[input.fromRole];
  const toPolicy = policies[input.toRole];
  const actorPolicy = policies[input.actor.workspaceRole];

  let effect: WorkspaceRoleChangeEffect;
  if (hasImplicitProjectAccess(toPolicy)) {
    effect = 'gain_implicit';
  } else if (hasImplicitProjectAccess(fromPolicy)) {
    effect = 'lose_implicit';
  } else if (input.liveProjectCount === 0) {
    effect = 'no_projects';
  } else {
    effect = 'apply_project_role';
  }

  const actorCanChoose = hasImplicitProjectAccess(actorPolicy);
  const projectRoleChoices =
    effect === 'apply_project_role'
      ? actorCanChoose
        ? assignableRangeOf(toPolicy)
        : [toPolicy.lowestAssignableRole]
      : [];

  const defaultProjectRole = hasImplicitProjectAccess(toPolicy)
    ? null
    : toPolicy.lowestAssignableRole;

  return {
    effect,
    projectRoleChoices,
    defaultProjectRole,
    actorCanChooseProjectRole: actorCanChoose,
  };
}

export function resolveAppliedProjectRole(
  plan: WorkspaceRoleChangePlan,
  toPolicy: ProjectAccessPolicy,
  requested: ProjectRole | null | undefined,
):
  | { ok: true; role: ProjectRole | null }
  | { ok: false; reason: 'actor_cannot_choose' | 'out_of_range' } {
  if (hasImplicitProjectAccess(toPolicy)) {
    return { ok: true, role: null };
  }

  if (requested == null) {
    return { ok: true, role: toPolicy.lowestAssignableRole };
  }

  const allowedRange = assignableRangeOf(toPolicy);
  if (!allowedRange.includes(requested)) {
    return { ok: false, reason: 'out_of_range' };
  }

  if (
    !plan.actorCanChooseProjectRole &&
    requested !== toPolicy.lowestAssignableRole
  ) {
    return { ok: false, reason: 'actor_cannot_choose' };
  }

  return { ok: true, role: requested };
}
