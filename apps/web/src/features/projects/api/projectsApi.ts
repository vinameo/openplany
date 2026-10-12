import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectListResponse,
  ProjectResponse,
} from "@repo/contracts";
import { request } from "../../../lib/apiClient";

export const projectsApi = {
  list: (slug: string, signal?: AbortSignal) =>
    request<ProjectListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects`,
      { signal },
    ),

  get: (slug: string, identifier: string, signal?: AbortSignal) =>
    request<ProjectResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(identifier)}`,
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
