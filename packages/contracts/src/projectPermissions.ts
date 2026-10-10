import type { ProjectRole } from './projectRoles.js';

export type ProjectPermission = string;

export type EnforcedProjectPermission = never;

export type ProjectRolePermissions = Readonly<
  Record<ProjectRole, readonly ProjectPermission[]>
>;

export function parseProjectPermissions(
  keys: readonly string[],
): ProjectPermission[] {
  const seen = new Set<string>();
  const result: ProjectPermission[] = [];
  for (const k of keys) {
    if (typeof k === 'string' && k.startsWith('project.') && !seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  }
  return result;
}

export function enforcedProjectPermissions(
  _granted: readonly ProjectPermission[],
): EnforcedProjectPermission[] {
  return [];
}

export type ProjectOwnershipBase =
  | 'project.workitems.delete'
  | 'project.comments.update'
  | 'project.comments.delete'
  | 'project.cycles.delete'
  | 'project.modules.delete'
  | 'project.views.update'
  | 'project.views.delete'
  | 'project.pages.update'
  | 'project.pages.delete';
