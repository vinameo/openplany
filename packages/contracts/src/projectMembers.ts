import type {
  EnforcedWorkspacePermission,
  WorkspacePermission,
} from './workspacePermissions.js';
import type { EnforcedProjectPermission, ProjectPermission } from './projectPermissions.js';
import type { ProjectRole } from './projectRoles.js';
import type { ProjectListItem } from './project.js';

export const PROJECT_MEMBER_LIST_MAX = 1000;

export const ADD_PROJECT_MEMBERS_REQUIREMENT = {
  project: 'project.members.manage',
  workspace: 'workspace.members.view',
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

export interface ProjectMemberResponse {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  avatarUrl: string | null;
  role: ProjectRole; // effective role
  assignedRole: ProjectRole;
  roleLimited: boolean;
  joinedAt: string; // ISO 8601
  accountActive: boolean;
}

export interface ProjectMemberListResponse {
  members: ProjectMemberResponse[];
  total: number;
  truncated: boolean;
  addableRoles: ProjectRole[];
}

export const PROJECT_MEMBER_CANDIDATE_STATUSES = [
  'addable',
  'already_member',
  'workspace_admin',
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
}

export const PROJECT_MEMBER_NOT_ADDABLE_REASONS = [
  'unavailable',
  'not_in_workspace',
  'workspace_admin',
  'already_member',
  'role_not_allowed',
] as const;
export type ProjectMemberNotAddableReason =
  (typeof PROJECT_MEMBER_NOT_ADDABLE_REASONS)[number];

export const PROJECT_MEMBER_NOT_ADDABLE_MESSAGES: Record<
  ProjectMemberNotAddableReason,
  string
> = {
  already_member: 'Already a member of this project',
  not_in_workspace: 'This person is no longer in this workspace.',
  unavailable: "This person can't be added. Their account may be deactivated.",
  role_not_allowed: 'This role is above what their workspace role allows.',
  workspace_admin: 'Workspace Admins can already access every project.',
};

export const PROJECT_MEMBER_NOT_ADDABLE_FIELD: Record<
  ProjectMemberNotAddableReason,
  'userId' | 'role'
> = {
  unavailable: 'userId',
  not_in_workspace: 'userId',
  workspace_admin: 'userId',
  already_member: 'userId',
  role_not_allowed: 'role',
};
