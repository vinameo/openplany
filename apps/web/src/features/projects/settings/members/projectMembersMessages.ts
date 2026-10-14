import {
  PROJECT_ROLE_LABELS,
  type ProjectRole,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  type WorkspaceRole,
} from '@repo/contracts';
import { translate } from '../../../../i18n/language';

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
