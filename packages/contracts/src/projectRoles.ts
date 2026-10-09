export const PROJECT_ROLES = [
  'admin',
  'contributor',
  'commenter',
  'guest',
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_ROLE_RANK = {
  admin: 40,
  contributor: 30,
  commenter: 20,
  guest: 10,
} as const satisfies Record<ProjectRole, number>;

export const PROJECT_ROLE_LABELS = {
  admin: 'Project Admin',
  contributor: 'Contributor',
  commenter: 'Commenter',
  guest: 'Guest',
} as const satisfies Record<ProjectRole, string>;

export const PROJECT_ROLE_SUMMARIES = {
  admin: 'Everything in the project, including settings and members',
  contributor: 'Create and edit work; delete what they created',
  commenter: 'View everything, comment and react',
  guest: 'View-only access',
} as const satisfies Record<ProjectRole, string>;
