import { useQuery } from "@tanstack/react-query";
import { statesApi } from "./statesApi";

export const stateKeys = {
  all: ["states"] as const,
  workspace: (slug: string) => [...stateKeys.all, "workspace", slug] as const,
  workspaceProjects: (slug: string) =>
    [...stateKeys.all, "workspaceProjects", slug] as const,
  project: (slug: string, identifier: string) =>
    [...stateKeys.workspaceProjects(slug), "project", identifier] as const,
};

export function useWorkspaceStatesQuery(slug: string, enabled = true) {
  return useQuery({
    queryKey: stateKeys.workspace(slug),
    queryFn: ({ signal }) => statesApi.listWorkspaceStates(slug, signal),
    staleTime: 30_000,
    enabled,
  });
}

export function useProjectStatesQuery(
  slug: string,
  identifier: string,
  enabled = true,
) {
  return useQuery({
    queryKey: stateKeys.project(slug, identifier),
    queryFn: ({ signal }) =>
      statesApi.listProjectStates(slug, identifier, signal),
    staleTime: 30_000,
    enabled,
  });
}
