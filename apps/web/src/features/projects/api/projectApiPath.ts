/**
 * Canonical base path for project-scoped API endpoints.
 * Encodes slug and identifier to protect against delimiter collisions.
 */
export function projectApiPath(slug: string, identifier: string): string {
  return `/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(identifier)}`;
}

