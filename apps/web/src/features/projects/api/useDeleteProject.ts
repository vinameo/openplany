import { useMutation } from "@tanstack/react-query";
import { projectsApi } from "./projectsApi";

export function useDeleteProject(slug: string) {
  return useMutation({
    mutationFn: (identifier: string) => projectsApi.delete(slug, identifier),
  });
}
