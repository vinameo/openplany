import type {
  CreateStateRequest,
  StateListResponse,
  StateMutationResponse,
  UpdateStateRequest,
} from "@repo/contracts";
import { request } from "../../../lib/apiClient";
import { projectApiPath } from "../../projects/api/projectApiPath";
import { workspaceApiPath } from "../../workspaces/api/workspaceApiPath";

export const statesApi = {
  listWorkspaceStates: (
    slug: string,
    signal?: AbortSignal,
  ): Promise<StateListResponse> =>
    request<StateListResponse>(`${workspaceApiPath(slug)}/states`, {
      signal,
    }),

  createWorkspaceState: (
    slug: string,
    body: CreateStateRequest,
  ): Promise<StateMutationResponse> =>
    request<StateMutationResponse>(`${workspaceApiPath(slug)}/states`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  updateWorkspaceState: (
    slug: string,
    stateId: string,
    body: UpdateStateRequest,
  ): Promise<StateMutationResponse> =>
    request<StateMutationResponse>(
      `${workspaceApiPath(slug)}/states/${encodeURIComponent(stateId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),

  deleteWorkspaceState: (
    slug: string,
    stateId: string,
    replacementStateId?: string,
  ): Promise<void> => {
    const params = new URLSearchParams();
    if (replacementStateId) {
      params.set("replacementStateId", replacementStateId);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<void>(
      `${workspaceApiPath(slug)}/states/${encodeURIComponent(stateId)}${query}`,
      { method: "DELETE" },
    );
  },

  listProjectStates: (
    slug: string,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<StateListResponse> =>
    request<StateListResponse>(`${projectApiPath(slug, identifier)}/states`, {
      signal,
    }),

  createProjectState: (
    slug: string,
    identifier: string,
    body: CreateStateRequest,
  ): Promise<StateMutationResponse> =>
    request<StateMutationResponse>(
      `${projectApiPath(slug, identifier)}/states`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),

  updateProjectState: (
    slug: string,
    identifier: string,
    stateId: string,
    body: UpdateStateRequest,
  ): Promise<StateMutationResponse> =>
    request<StateMutationResponse>(
      `${projectApiPath(slug, identifier)}/states/${encodeURIComponent(stateId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),

  deleteProjectState: (
    slug: string,
    identifier: string,
    stateId: string,
    replacementStateId?: string,
  ): Promise<void> => {
    const params = new URLSearchParams();
    if (replacementStateId) {
      params.set("replacementStateId", replacementStateId);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<void>(
      `${projectApiPath(slug, identifier)}/states/${encodeURIComponent(stateId)}${query}`,
      { method: "DELETE" },
    );
  },
};
