import type { WorkspaceRole } from './workspace.js';

export const WORKSPACE_PERMISSIONS = [
  'workspace.settings.view',
  'workspace.settings.update',
  'workspace.delete',
  'workspace.ownership.transfer',
  'workspace.members.view',
  'workspace.members.email.view',
  'workspace.members.add',
  'workspace.members.remove',
  'workspace.members.role.update',
  'workspace.members.history.view',
  'workspace.projects.create',
  'workspace.projects.browse',
  'workspace.projects.delete',
] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export const ENFORCED_WORKSPACE_PERMISSIONS = [
  'workspace.settings.update',
] as const satisfies readonly WorkspacePermission[];
export type EnforcedWorkspacePermission =
  (typeof ENFORCED_WORKSPACE_PERMISSIONS)[number];

export const WORKSPACE_ROLE_PERMISSIONS = {
  owner: [
    'workspace.settings.view',
    'workspace.settings.update',
    'workspace.delete',
    'workspace.ownership.transfer',
    'workspace.members.view',
    'workspace.members.email.view',
    'workspace.members.add',
    'workspace.members.remove',
    'workspace.members.role.update',
    'workspace.members.history.view',
    'workspace.projects.create',
    'workspace.projects.browse',
    'workspace.projects.delete',
  ],
  admin: [
    'workspace.settings.view',
    'workspace.settings.update',
    'workspace.members.view',
    'workspace.members.email.view',
    'workspace.members.add',
    'workspace.members.remove',
    'workspace.members.role.update',
    'workspace.members.history.view',
    'workspace.projects.create',
    'workspace.projects.browse',
    'workspace.projects.delete',
  ],
  member: [
    'workspace.settings.view',
    'workspace.members.view',
    'workspace.projects.browse',
  ],
  guest: ['workspace.settings.view'],
} as const satisfies Record<WorkspaceRole, readonly WorkspacePermission[]>;

export function workspacePermissionsOf(
  role: WorkspaceRole | null | undefined,
): WorkspacePermission[] {
  if (!role || !(role in WORKSPACE_ROLE_PERMISSIONS)) return [];
  return [...WORKSPACE_ROLE_PERMISSIONS[role]];
}

export function enforcedWorkspacePermissionsOf(
  role: WorkspaceRole | null | undefined,
): EnforcedWorkspacePermission[] {
  if (!role || !(role in WORKSPACE_ROLE_PERMISSIONS)) return [];
  const rolePerms = new Set<WorkspacePermission>(WORKSPACE_ROLE_PERMISSIONS[role]);
  return ENFORCED_WORKSPACE_PERMISSIONS.filter((p) => rolePerms.has(p));
}
