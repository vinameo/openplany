import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectListResponse,
} from "@repo/contracts";
import { request } from "../../../lib/apiClient";

export const projectsApi = {
  list: (slug: string, signal?: AbortSignal) =>
    request<ProjectListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects`,
      { signal },
    ),

  create: (slug: string, body: CreateProjectRequest, signal?: AbortSignal) =>
    request<CreateProjectResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    ),
};
