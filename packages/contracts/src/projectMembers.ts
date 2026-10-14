import type { MessageRef } from "./catalog/index.js";
import type { WorkspaceRole } from "./workspace.js";
import type {
  EnforcedWorkspacePermission,
  WorkspacePermission,
} from "./workspacePermissions.js";
import type {
  EnforcedProjectPermission,
  ProjectPermission,
} from "./projectPermissions.js";
import type { ProjectRole } from "./projectRoles.js";
import type { ProjectListItem } from "./project.js";
import { MEMBER_MESSAGES } from "./memberMessages.js";
import { isProjectAdminRole } from "./rolePermissionRules.js";

export const PROJECT_MEMBER_LIST_MAX = 1000;

export const ADD_PROJECT_MEMBERS_REQUIREMENT = {
  project: "project.members.manage",
  workspace: "workspace.members.view",
} as const satisfies {
  project: EnforcedProjectPermission;
  workspace: EnforcedWorkspacePermission;
};

export function canAddProjectMembers(
  projectPermissions: readonly ProjectPermission[],
  workspacePermissions: readonly WorkspacePermission[],
): boolean {
  return (
    projectPermissions.includes(ADD_PROJECT_MEMBERS_REQUIREMENT.project) &&
    workspacePermissions.includes(ADD_PROJECT_MEMBERS_REQUIREMENT.workspace)
  );
}

export type ProjectMemberSource = "assigned" | "inherited";

export interface ProjectMemberResponse {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  avatarUrl: string | null;
  role: ProjectRole; // effective role
  assignedRole: ProjectRole | null;
  roleLimited: boolean;
  joinedAt: string | null; // ISO 8601
  accountActive: boolean;
  source: ProjectMemberSource;
  workspaceRole: WorkspaceRole;
  assignableRoles: ProjectRole[];
}

export interface ProjectMemberListResponse {
  /** Inherited members (source 'inherited') first, then project members. */
  members: ProjectMemberResponse[];
  /** Real number of project members (Workspace Admins and other implicit roles excluded). = ProjectListItem.memberCount. */
  total: number;
  /** true when total > number of 'assigned' rows in members. */
  truncated: boolean;
  addableRoles: ProjectRole[];
  assignedAdminCount: number;
}

export const PROJECT_MEMBER_CANDIDATE_STATUSES = [
  "addable",
  "already_member",
  "workspace_admin",
] as const;
export type ProjectMemberCandidateStatus =
  (typeof PROJECT_MEMBER_CANDIDATE_STATUSES)[number];

export interface ProjectMemberCandidate {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  status: ProjectMemberCandidateStatus;
  addableRoles: ProjectRole[];
  workspaceRole?: WorkspaceRole;
}

export interface ProjectMemberCandidateListResponse {
  candidates: ProjectMemberCandidate[];
}

export interface AddProjectMembersRequest {
  members: { userId: string; role: ProjectRole }[];
}

export interface AddProjectMembersResponse {
  members: ProjectMemberResponse[];
  project: ProjectListItem;
  assignedAdminCount: number;
}

export interface ChangeProjectRoleRequest {
  fromRole: ProjectRole;
  role: ProjectRole;
}

export interface ChangeProjectRoleResponse {
  member: ProjectMemberResponse;
  assignedAdminCount: number;
}

export type ProjectRoleChangeKind = "gain_admin" | "lose_admin" | "other";

export function projectRoleChangeKind(
  from: ProjectRole,
  to: ProjectRole,
): ProjectRoleChangeKind {
  const fromAdmin = isProjectAdminRole(from);
  const toAdmin = isProjectAdminRole(to);
  if (!fromAdmin && toAdmin) {
    return "gain_admin";
  }
  if (fromAdmin && !toAdmin) {
    return "lose_admin";
  }
  return "other";
}

export const PROJECT_ROLE_CHANGE_MESSAGES = {
  cantChange: "You can't change this person's role",
  inherited: "Workspace Admins are Project Admins in every project.",
  memberGone: "This person is no longer in this project.",
} as const;

export const PROJECT_ROLE_CHANGE_MESSAGE_REFS = {
  cantChange: { key: "project:errors.cantChangeRole" },
  inherited: { key: "project:errors.inheritedRole" },
  memberGone: { key: "project:errors.memberGone" },
} as const satisfies Record<keyof typeof PROJECT_ROLE_CHANGE_MESSAGES, MessageRef>;

export const PROJECT_MEMBER_NOT_ADDABLE_REASONS = [
  "unavailable",
  "not_in_workspace",
  "workspace_admin",
  "already_member",
  "role_not_allowed",
] as const;
export type ProjectMemberNotAddableReason =
  (typeof PROJECT_MEMBER_NOT_ADDABLE_REASONS)[number];

export const PROJECT_MEMBER_NOT_ADDABLE_MESSAGES: Record<
  ProjectMemberNotAddableReason,
  string
> = {
  already_member: "Already a member of this project",
  not_in_workspace: "This person is no longer in this workspace.",
  unavailable: "This person can't be added. Their account may be deactivated.",
  role_not_allowed: MEMBER_MESSAGES.roleOutOfRange,
  workspace_admin: "Workspace Admins can already access every project.",
};

export const PROJECT_MEMBER_NOT_ADDABLE_MESSAGE_REFS: Record<
  ProjectMemberNotAddableReason,
  MessageRef
> = {
  already_member: { key: "project:errors.alreadyMember" },
  not_in_workspace: { key: "project:errors.notInWorkspace" },
  unavailable: { key: "project:errors.unavailable" },
  role_not_allowed: { key: "members:errors.roleOutOfRange" },
  workspace_admin: { key: "project:errors.workspaceAdmin" },
};

export const PROJECT_MEMBER_NOT_ADDABLE_FIELD: Record<
  ProjectMemberNotAddableReason,
  "userId" | "role"
> = {
  unavailable: "userId",
  not_in_workspace: "userId",
  workspace_admin: "userId",
  already_member: "userId",
  role_not_allowed: "role",
};
