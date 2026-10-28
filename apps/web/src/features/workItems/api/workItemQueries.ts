/**
 * Server-state keys for work items.
 */
export const workItemKeys = {
  all: ["workItems"] as const,
  project: (slug: string, identifier: string) =>
    [...workItemKeys.all, "project", slug, identifier] as const,
};

