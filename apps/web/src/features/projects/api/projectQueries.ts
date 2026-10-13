import type { QueryClient } from "@tanstack/react-query";
import type {
  AddProjectMembersResponse,
  ProjectListItem,
  ProjectMemberListResponse,
  ProjectListResponse,
} from "@repo/contracts";

/**
 * Server-state keys for projects. A project's key extends its list's key, so
 * invalidating a workspace's project list also invalidates its projects.
 */
export const projectKeys = {
  list: (workspaceSlug: string) =>
    ["workspaces", workspaceSlug, "projects"] as const,
  detail: (workspaceSlug: string, identifier: string) =>
    ["workspaces", workspaceSlug, "projects", identifier] as const,
  members: (workspaceSlug: string, identifier: string) =>
    [...projectKeys.detail(workspaceSlug, identifier), "members"] as const,
  memberCandidates: (
    workspaceSlug: string,
    identifier: string,
    email?: string,
  ) =>
    email !== undefined
      ? ([
          ...projectKeys.detail(workspaceSlug, identifier),
          "member-candidates",
          email,
        ] as const)
      : ([
          ...projectKeys.detail(workspaceSlug, identifier),
          "member-candidates",
        ] as const),
};

export function clearProjectMemberCandidates(
  qc: QueryClient,
  slug: string,
  identifier: string,
): void {
  qc.removeQueries({
    queryKey: [...projectKeys.detail(slug, identifier), "member-candidates"],
  });
}

export function addProjectMembersToCache(
  qc: QueryClient,
  slug: string,
  identifier: string,
  res: AddProjectMembersResponse,
): void {
  qc.setQueryData<ProjectMemberListResponse>(
    projectKeys.members(slug, identifier),
    (curr) => {
      if (!curr) return curr;
      const existingUserIds = new Set(curr.members.map((m) => m.userId));
      const newMembers = res.members.filter(
        (m) => !existingUserIds.has(m.userId),
      );
      const nextMembers = [...curr.members, ...newMembers];
      const nextTotal =
        res.project.memberCount ?? curr.total + newMembers.length;
      return {
        ...curr,
        members: nextMembers,
        total: nextTotal,
      };
    },
  );
}

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
  });
}
