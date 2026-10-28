import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectListResponse,
  ProjectResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
} from "@repo/contracts";
import { request } from "../../../lib/apiClient";
import { projectApiPath } from "./projectApiPath";

export const projectsApi = {
  list: (slug: string, signal?: AbortSignal) =>
    request<ProjectListResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}/projects`,
      { signal },
    ),

  get: (slug: string, identifier: string, signal?: AbortSignal) =>
    request<ProjectResponse>(projectApiPath(slug, identifier), { signal }),

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

  update: (
    slug: string,
    identifier: string,
    body: UpdateProjectRequest,
    signal?: AbortSignal,
  ) =>
    request<UpdateProjectResponse>(projectApiPath(slug, identifier), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),

  delete: (slug: string, identifier: string, signal?: AbortSignal) =>
    request<void>(projectApiPath(slug, identifier), {
      method: "DELETE",
      signal,
    }),
};
