import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { StateListResponse } from "@repo/contracts";
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

/**
 * A work item was created in a project at `stateId`: add one to that state's
 * count on the project's list and on the workspace list (whose counts cover
 * every live project). Lists loaded without counts stay as they are.
 */
export function addWorkItemToStateCounts(
  queryClient: QueryClient,
  slug: string,
  identifier: string,
  stateId: string,
) {
  const bump = (old: StateListResponse | undefined) => {
    if (!old) return old;
    return {
      ...old,
      states: old.states.map((s) =>
        s.id === stateId && s.workItemCount !== undefined
          ? { ...s, workItemCount: s.workItemCount + 1 }
          : s,
      ),
    };
  };
  queryClient.setQueryData<StateListResponse>(
    stateKeys.project(slug, identifier),
    bump,
  );
  queryClient.setQueryData<StateListResponse>(stateKeys.workspace(slug), bump);
}
