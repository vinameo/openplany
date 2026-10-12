import type { QueryClient } from "@tanstack/react-query";
import type { ProjectListItem, ProjectListResponse } from "@repo/contracts";

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

export function addProjectToCache(
  qc: QueryClient,
  slug: string,
  project: ProjectListItem,
): void {
  qc.setQueryData<ProjectListResponse>(
    projectKeys.list(slug),
    (curr) =>
      curr && {
        ...curr,
        projects: [project, ...curr.projects],
        total: curr.total + 1,
      },
  );
  qc.setQueryData(projectKeys.detail(slug, project.identifier), project);
}

export function replaceProjectInCache(
  qc: QueryClient,
  slug: string,
  project: ProjectListItem,
): void {
  qc.setQueryData(
    projectKeys.detail(slug, project.identifier),
    project,
  );
  qc.setQueryData<ProjectListResponse>(
    projectKeys.list(slug),
    (curr) =>
      curr && {
        ...curr,
        projects: curr.projects.map((p) =>
          p.id === project.id ? project : p,
        ),
      },
  );
}

export function removeProjectFromCache(
  qc: QueryClient,
  slug: string,
  identifier: string,
): void {
  qc.setQueryData<ProjectListResponse>(
    projectKeys.list(slug),
    (curr) => {
      if (!curr) return curr;
      const nextProjects = curr.projects.filter(
        (p) => p.identifier !== identifier,
      );
      const removedCount = curr.projects.length - nextProjects.length;
      return {
        ...curr,
        projects: nextProjects,
        total: Math.max(0, curr.total - removedCount),
      };
    },
  );
  qc.removeQueries({
    queryKey: projectKeys.detail(slug, identifier),
    exact: true,
  });
}
