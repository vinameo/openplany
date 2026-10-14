import {
  PROJECT_ROLE_LABELS,
  type ProjectRole,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  type WorkspaceRole,
} from '@repo/contracts';
import { translate } from '../../../../i18n/language';

export const WORKSPACE_ADMINS_NOTE = translate('project:members.workspaceAdminsNote');
export const ADD_PROJECT_MEMBERS_DESCRIPTION = translate(
  'project:members.addProjectMembersDescription',
);
export const PROJECT_ADMIN_NOTICE = translate('project:members.projectAdminNotice');
export const ROLE_LIMITED_TOOLTIP = translate('project:members.roleLimitedTooltip');
export const NO_MEMBERS_YET = translate('project:members.emptyTitle');
export const TYPE_FULL_EMAIL = translate('project:members.typeFullEmail');
export const NO_WORKSPACE_MEMBER_FOUND = translate(
  'project:members.noWorkspaceMemberFound',
);
export const ADD_TO_WORKSPACE_LINK = translate('project:members.addToWorkspaceLink');
export const ALREADY_IN_PROJECT_LABEL = translate('project:members.alreadyInProject');
export const WORKSPACE_ADMIN_CANDIDATE_LABEL = translate(
  'project:members.workspaceAdminCandidate',
);
export const NOT_ADDED_TO_PROJECT = translate('project:members.notAddedToProject');
export const NONE_ADDED_TO_PROJECT = translate('project:members.noneAddedNote');

export const PROJECT_MEMBERS_MESSAGES = {
  get workspaceAdminsNote(): string {
    return translate('project:members.workspaceAdminsNote');
  },
  get addProjectMembersDescription(): string {
    return translate('project:members.addProjectMembersDescription');
  },
  get projectAdminNotice(): string {
    return translate('project:members.projectAdminNotice');
  },
  get roleLimitedTooltip(): string {
    return translate('project:members.roleLimitedTooltip');
  },
  get noMembersYet(): string {
    return translate('project:members.emptyTitle');
  },
  get typeFullEmail(): string {
    return translate('project:members.typeFullEmail');
  },
  get noWorkspaceMemberFound(): string {
    return translate('project:members.noWorkspaceMemberFound');
  },
  get addToWorkspaceLink(): string {
    return translate('project:members.addToWorkspaceLink');
  },
  get alreadyInProject(): string {
    return translate('project:members.alreadyInProject');
  },
  get workspaceAdminCandidate(): string {
    return translate('project:members.workspaceAdminCandidate');
  },
  get notAddedToProject(): string {
    return translate('project:members.notAddedToProject');
  },
  get noneAddedNote(): string {
    return translate('project:members.noneAddedNote');
  },
} as const;

export function limitedToRoleMessage(roleLabel: string): string {
  return translate('project:members.limitedToRole', { role: roleLabel });
}

export function roleRaisedHint(
  workspaceRole: WorkspaceRole | string = 'member',
  role: ProjectRole | string = 'commenter',
): string {
  const wsLabel =
    (WORKSPACE_ROLE_LABELS as Record<string, string>)[workspaceRole] ??
    WORKSPACE_ROLE_LABELS.member;
  const roleLabel =
    (PROJECT_ROLE_LABELS as Record<string, string>)[role] ??
    PROJECT_ROLE_LABELS.commenter;
  return translate('project:members.roleRaisedHint', {
    wsRole: wsLabel,
    role: roleLabel,
  });
}

export function inheritedRoleTooltip(
  workspaceRole: WorkspaceRole = 'admin',
  implicitRole: ProjectRole = 'admin',
): string {
  const wsLabel =
    (WORKSPACE_ROLE_QUALIFIED_LABELS as Record<string, string>)[workspaceRole] ??
    WORKSPACE_ROLE_QUALIFIED_LABELS.admin;
  const projLabel =
    (PROJECT_ROLE_LABELS as Record<string, string>)[implicitRole] ??
    PROJECT_ROLE_LABELS.admin;
  return translate('project:members.inheritedRoleTooltip', {
    wsRole: wsLabel,
    projRole: projLabel,
  });
}

export function makeAdminTitle(name: string): string {
  return translate('project:members.makeAdminTitle', { name });
}

export function makeAdminBody(name: string): string {
  return translate('project:members.makeAdminBody', { name });
}

export function changeRoleTitle(name: string, roleLabel: string): string {
  return translate('project:members.changeRoleTitle', { name, role: roleLabel });
}

export function loseAdminBody(name: string): string {
  return translate('project:members.loseAdminBody', { name });
}

export function lastAdminWarning(projectName: string): string {
  return translate('project:members.lastAdminWarning', { project: projectName });
}

export function toastChanged(
  name: string,
  roleLabel: string,
  projectName: string,
): string {
  return translate('project:members.toastChanged', {
    name,
    role: roleLabel,
    project: projectName,
  });
}
