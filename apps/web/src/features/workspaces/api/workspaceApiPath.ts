/**
 * Canonical base path for workspace-scoped API endpoints.
 * Encodes slug to protect against delimiter collisions.
 */
export function workspaceApiPath(slug: string): string {
  return `/api/workspaces/${encodeURIComponent(slug)}`;
}

