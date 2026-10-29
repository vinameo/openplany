import type { ProjectRole } from "./projectRoles.js";

export type ProjectPermission = string;

export const ENFORCED_PROJECT_PERMISSIONS = [
  "project.members.view",
  "project.members.manage",
  "project.settings.view",
  "project.settings.update",
  "project.states.view",
  "project.states.manage",
  "project.workitems.create",
] as const satisfies readonly ProjectPermission[];
export type EnforcedProjectPermission =
  (typeof ENFORCED_PROJECT_PERMISSIONS)[number];

export type ProjectRolePermissions = Readonly<
  Record<ProjectRole, readonly ProjectPermission[]>
>;

export function parseProjectPermissions(
  keys: readonly string[],
): ProjectPermission[] {
  const seen = new Set<string>();
  const result: ProjectPermission[] = [];
  for (const k of keys) {
    if (typeof k === "string" && k.startsWith("project.") && !seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  }
  return result;
}

export function enforcedProjectPermissions(
  granted: readonly ProjectPermission[],
): EnforcedProjectPermission[] {
  const set = new Set<ProjectPermission>(granted);
  return ENFORCED_PROJECT_PERMISSIONS.filter((p) => set.has(p));
}

export type ProjectOwnershipBase =
  | "project.workitems.delete"
  | "project.comments.update"
  | "project.comments.delete"
  | "project.cycles.delete"
  | "project.modules.delete"
  | "project.views.update"
  | "project.views.delete"
  | "project.pages.update"
  | "project.pages.delete";
