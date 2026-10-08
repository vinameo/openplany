import type {
  CreateWorkspaceRequest,
  SlugCheckResponse,
  UpdateWorkspaceRequest,
  WorkspaceListResponse,
  WorkspaceResponse,
} from "@repo/contracts";
import { request } from "../../../lib/apiClient";

export const workspaceApi = {
  list(): Promise<WorkspaceListResponse> {
    return request<WorkspaceListResponse>("/api/workspaces");
  },

  get(slug: string, signal?: AbortSignal): Promise<WorkspaceResponse> {
    return request<WorkspaceResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}`,
      { signal },
    );
  },

  create(body: CreateWorkspaceRequest): Promise<WorkspaceResponse> {
    return request<WorkspaceResponse>("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  update(
    slug: string,
    body: UpdateWorkspaceRequest,
    signal?: AbortSignal,
  ): Promise<WorkspaceResponse> {
    return request<WorkspaceResponse>(
      `/api/workspaces/${encodeURIComponent(slug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    );
  },

  checkSlug(slug: string, signal?: AbortSignal): Promise<SlugCheckResponse> {
    return request<SlugCheckResponse>(
      `/api/workspaces/slug-check?slug=${encodeURIComponent(slug)}`,
      { signal },
    );
  },
};
