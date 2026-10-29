import { request } from "../../../../../lib/apiClient";
import type {
  AddWorkspaceMembersRequest,
  AddWorkspaceMembersResponse,
  ChangeWorkspaceRoleRequest,
  ChangeWorkspaceRoleResponse,
  MemberCandidateListResponse,
  WorkspaceMemberListResponse,
  WorkspaceRole,
  WorkspaceRoleChangePreview,
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

  previewRoleChange: (
    slug: string,
    userId: string,
    role: WorkspaceRole,
    signal?: AbortSignal,
  ) =>
    request<WorkspaceRoleChangePreview>(
      `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/role-change-preview?role=${encodeURIComponent(role)}`,
      { signal },
    ),

  changeRole: (
    slug: string,
    userId: string,
    body: ChangeWorkspaceRoleRequest,
    signal?: AbortSignal,
  ) =>
    request<ChangeWorkspaceRoleResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    ),
};
