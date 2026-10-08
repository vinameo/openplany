import type { WorkspaceRole } from './workspace.js';

/** Only permissions some feature already checks. Add new ones with the feature (RQ 8.1). */
export const WORKSPACE_PERMISSIONS = ['workspace.settings.update'] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

/** Single source of role → permission mapping. Deny by default: missing = not granted. */
export const WORKSPACE_ROLE_PERMISSIONS = {
  owner: ['workspace.settings.update'],
  admin: ['workspace.settings.update'],
  member: [],
  guest: [],
} as const satisfies Record<WorkspaceRole, readonly WorkspacePermission[]>;

export function workspacePermissionsOf(role: WorkspaceRole): WorkspacePermission[] {
  return [...WORKSPACE_ROLE_PERMISSIONS[role]];
}

