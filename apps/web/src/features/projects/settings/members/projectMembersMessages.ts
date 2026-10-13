import {
  PROJECT_ROLE_LABELS,
  type ProjectRole,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from '@repo/contracts';

export const WORKSPACE_ADMINS_NOTE =
  'Workspace Admins can access every project.';
export const ADD_PROJECT_MEMBERS_DESCRIPTION =
  'Add members to collaborate in your project.';
export const PROJECT_ADMIN_NOTICE =
  'Project Admins can manage everyone in this project, including you.';
export const ROLE_LIMITED_TOOLTIP = 'Limited by their workspace role';
export const NO_MEMBERS_YET = 'No members yet';
export const TYPE_FULL_EMAIL = 'Type the full email address';
export const NO_WORKSPACE_MEMBER_FOUND =
  'No workspace member with this email.';
export const ADD_TO_WORKSPACE_LINK = 'Add to workspace';
export const ALREADY_IN_PROJECT_LABEL = 'Already in this project';
export const WORKSPACE_ADMIN_CANDIDATE_LABEL =
  'Workspace Admin · has access';
export function limitedToRoleMessage(roleLabel: string): string {
  return `Limited to ${roleLabel} by their workspace role.`;
}

export function roleRaisedHint(
  workspaceRole: WorkspaceRole | string = 'member',
  role: ProjectRole | string = 'commenter',
): string {
  const wsLabel =
    (WORKSPACE_ROLE_LABELS as Record<string, string>)[workspaceRole] ??
    workspaceRole ??
    'Member';
  const roleLabel =
    (PROJECT_ROLE_LABELS as Record<string, string>)[role] ??
    role ??
    'Commenter';
  return `${wsLabel}s are added as ${roleLabel} or higher.`;
}
