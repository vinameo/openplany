import { useQuery } from "@tanstack/react-query";
import { prioritiesApi } from "./prioritiesApi";

export const priorityKeys = {
  all: ["priorities"] as const,
  project: (slug: string, identifier: string) =>
    [...priorityKeys.all, "project", slug, identifier] as const,
};

export function useProjectPrioritiesQuery(
  slug: string,
  identifier: string,
  enabled = true,
) {
  return useQuery({
    queryKey: priorityKeys.project(slug, identifier),
    queryFn: ({ signal }) =>
      prioritiesApi.listProjectPriorities(slug, identifier, signal),
    staleTime: 30_000,
    enabled,
  });
}
