import type {
  ProjectAccess,
  ProjectActor,
  WorkspacePermission,
  WorkspaceRole,
} from '@repo/contracts';

/** The actor of a members request, in the shape every contracts permission helper takes. */
export function toProjectActor(
  userId: string,
  workspaceRole: WorkspaceRole,
  access: ProjectAccess,
): ProjectActor {
  return {
    userId,
    workspaceRole,
    effectiveRole: access.role,
    permissions: access.permissions,
  };
}

/** Member emails appear in a response only with this workspace permission (RQ INV-07). */
export function canSeeMemberEmails(
  workspacePermissions: readonly WorkspacePermission[],
): boolean {
  return workspacePermissions.includes('workspace.members.email.view');
}
