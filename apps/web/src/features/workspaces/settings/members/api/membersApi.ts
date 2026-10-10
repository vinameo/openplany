import { request } from "../../../../../lib/apiClient";
import type { WorkspaceMemberListResponse } from "@repo/contracts";

export const membersApi = {
  list: (slug: string, signal?: AbortSignal) =>
    request<WorkspaceMemberListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/members`,
      { signal },
    ),
};

