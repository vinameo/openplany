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

export const PROJECT_ROLE_SUMMARIES = {
  admin: "Everything in the project, including settings and members",
  contributor: "Create and edit work; delete what they created",
  commenter: "View everything, comment and react",
  viewer: "View-only access",
} as const satisfies Record<ProjectRole, string>;

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
