export type WorkspacePermission = string;

export const ENFORCED_WORKSPACE_PERMISSIONS = [
  'workspace.settings.update',
  'workspace.members.view',
  'workspace.members.email.view',
  'workspace.members.add',
] as const satisfies readonly WorkspacePermission[];

export type EnforcedWorkspacePermission =
  (typeof ENFORCED_WORKSPACE_PERMISSIONS)[number];

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
