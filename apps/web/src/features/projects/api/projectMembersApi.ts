import { request } from "../../../lib/apiClient";
import type {
  AddProjectMembersRequest,
  AddProjectMembersResponse,
  ChangeProjectRoleRequest,
  ChangeProjectRoleResponse,
  ProjectMemberCandidateListResponse,
  ProjectMemberListResponse,
} from "@repo/contracts";

export const projectMembersApi = {
  list: (slug: string, identifier: string, signal?: AbortSignal) =>
    request<ProjectMemberListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(identifier)}/members`,
      { signal },
    ),

  searchCandidates: (
    slug: string,
    identifier: string,
    email: string,
    signal?: AbortSignal,
  ) =>
    request<ProjectMemberCandidateListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(identifier)}/member-candidates?email=${encodeURIComponent(email)}`,
      { signal },
    ),

  add: (
    slug: string,
    identifier: string,
    body: AddProjectMembersRequest,
    signal?: AbortSignal,
  ) =>
    request<AddProjectMembersResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(identifier)}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    ),

  changeRole: (
    slug: string,
    identifier: string,
    userId: string,
    body: ChangeProjectRoleRequest,
    signal?: AbortSignal,
  ) =>
    request<ChangeProjectRoleResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(identifier)}/members/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    ),
};
