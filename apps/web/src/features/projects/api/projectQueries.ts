/**
 * Server-state keys for projects. A project's key extends its list's key, so
 * invalidating a workspace's project list also invalidates its projects.
 */
export const projectKeys = {
  list: (workspaceSlug: string) =>
    ["workspaces", workspaceSlug, "projects"] as const,
  detail: (workspaceSlug: string, identifier: string) =>
    ["workspaces", workspaceSlug, "projects", identifier] as const,
};
