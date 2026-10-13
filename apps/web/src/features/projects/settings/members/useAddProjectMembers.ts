import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AddProjectMembersRequest,
  AddProjectMembersResponse,
} from "@repo/contracts";
import { useContext } from "react";
import { ApiRequestError } from "../../../../lib/apiClient";
import { CurrentProjectContext } from "../../detail/currentProjectContext";
import { projectMembersApi } from "../../api/projectMembersApi";
import {
  addProjectMembersToCache,
  clearProjectMemberCandidates,
  projectKeys,
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
    onError: (err) => {
      // The actor lost the right to add, or the project is gone: the member
      // list's addableRoles is stale too, so refetch it rather than offer the
      // same failing add again.
      if (
        err instanceof ApiRequestError &&
        (err.status === 403 || err.status === 404)
      ) {
        void qc.invalidateQueries({
          queryKey: projectKeys.members(slug, identifier),
        });
      }
    },
  });
}
