import type { MessageKey } from "./catalog/types.js";

export const PROJECT_ROLES = [
  "admin",
  "contributor",
  "commenter",
  "viewer",
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_ROLE_RANK = {
  admin: 40,
  contributor: 30,
  commenter: 20,
  viewer: 10,
} as const satisfies Record<ProjectRole, number>;

export const PROJECT_ROLE_LABELS = {
  admin: "Project Admin",
  contributor: "Contributor",
  commenter: "Commenter",
  viewer: "Viewer",
} as const satisfies Record<ProjectRole, string>;

/** One-line description of each project role, translated where it is shown. */
export const PROJECT_ROLE_SUMMARY_KEYS = {
  admin: "common:roles.project.summary.admin",
  contributor: "common:roles.project.summary.contributor",
  commenter: "common:roles.project.summary.commenter",
  viewer: "common:roles.project.summary.viewer",
} as const satisfies Record<ProjectRole, MessageKey>;

/** Vai trò ghi cho người tạo project (Q-R11). */
export const PROJECT_CREATOR_ROLE = "admin" as const satisfies ProjectRole;

export function higherProjectRole(
  a: ProjectRole | null,
  b: ProjectRole | null,
): ProjectRole | null {
  if (a === null) return b;
  if (b === null) return a;
  return PROJECT_ROLE_RANK[a] >= PROJECT_ROLE_RANK[b] ? a : b;
}

export function lowerProjectRole(a: ProjectRole, b: ProjectRole): ProjectRole {
  return PROJECT_ROLE_RANK[a] <= PROJECT_ROLE_RANK[b] ? a : b;
}
