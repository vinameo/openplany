import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AddProjectMembersRequest,
  AddProjectMembersResponse,
} from "@repo/contracts";
import { useContext } from "react";
import { CurrentProjectContext } from "../../detail/currentProjectContext";
import { projectMembersApi } from "../../api/projectMembersApi";
import {
  addProjectMembersToCache,
  clearProjectMemberCandidates,
} from "../../api/projectQueries";

export function useAddProjectMembers(slug: string, identifier: string) {
  const qc = useQueryClient();
  const currentProject = useContext(CurrentProjectContext);

  return useMutation<
    AddProjectMembersResponse,
    unknown,
    AddProjectMembersRequest
  >({
    mutationFn: (body: AddProjectMembersRequest) =>
      projectMembersApi.add(slug, identifier, body),
    onSuccess: (res) => {
      addProjectMembersToCache(qc, slug, identifier, res);
      currentProject?.applyProjectUpdate(res.project);
      clearProjectMemberCandidates(qc, slug, identifier);
    },
  });
}
