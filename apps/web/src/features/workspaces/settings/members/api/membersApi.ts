import { request } from "../../../../../lib/apiClient";
import type {
  AddWorkspaceMembersRequest,
  AddWorkspaceMembersResponse,
  MemberCandidateListResponse,
  WorkspaceMemberListResponse,
} from "@repo/contracts";

export const membersApi = {
  list: (slug: string, signal?: AbortSignal) =>
    request<WorkspaceMemberListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/members`,
      { signal },
    ),

  searchCandidates: (slug: string, query: string, signal?: AbortSignal) =>
    request<MemberCandidateListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/member-candidates?email=${encodeURIComponent(query)}`,
      { signal },
    ),

  add: (slug: string, body: AddWorkspaceMembersRequest, signal?: AbortSignal) =>
    request<AddWorkspaceMembersResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    ),
};
