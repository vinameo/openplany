
export const PERMISSION_GROUP_LABELS = {
  // Workspace groups
  "workspace.settings": "Settings",
  "workspace.members": "Members",
  "workspace.projects": "Projects",
  "workspace.delete": "Workspace",

  // Project groups
  "project.settings": "Project",
  "project.archive": "Project",
  "project.members": "Members",
  "project.workitems": "Work items",
  "project.comments": "Comments",
  "project.reactions": "Comments",
  "project.cycles": "Cycles",
  "project.modules": "Modules",
  "project.views": "Views",
  "project.pages": "Pages",
  "project.labels": "Labels, states and estimates",
  "project.states": "Labels, states and estimates",
  "project.estimates": "Labels, states and estimates",
  "project.analytics": "Analytics",
} as const;

export function permissionGroupOf(permission: string): string {
  const parts = permission.split(".");
  const key = `${parts[0]}.${parts[1]}` as keyof typeof PERMISSION_GROUP_LABELS;
  return PERMISSION_GROUP_LABELS[key] ?? "General";
}
