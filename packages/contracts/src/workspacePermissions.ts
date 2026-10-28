export type WorkspacePermission = string;

export const ENFORCED_WORKSPACE_PERMISSIONS = [
  'workspace.settings.view',
  'workspace.settings.update',
  'workspace.members.view',
  'workspace.members.email.view',
  'workspace.members.add',
  'workspace.members.role.update',
  'workspace.projects.create',
  'workspace.projects.delete',
  'workspace.states.manage',
] as const satisfies readonly WorkspacePermission[];

export type EnforcedWorkspacePermission =
  (typeof ENFORCED_WORKSPACE_PERMISSIONS)[number];

export const CHANGE_WORKSPACE_ROLE_REQUIREMENT = [
  'workspace.members.role.update',
  'workspace.members.view',
] as const satisfies readonly EnforcedWorkspacePermission[];

export function parseWorkspacePermissions(
  keys: readonly string[],
): WorkspacePermission[] {
  const seen = new Set<string>();
  const result: WorkspacePermission[] = [];
  for (const k of keys) {
    if (typeof k === 'string' && k.startsWith('workspace.') && !seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  }
  return result;
}

export function enforcedWorkspacePermissions(
  granted: readonly WorkspacePermission[],
): EnforcedWorkspacePermission[] {
  const set = new Set<WorkspacePermission>(granted);
  return ENFORCED_WORKSPACE_PERMISSIONS.filter((p) => set.has(p));
}
