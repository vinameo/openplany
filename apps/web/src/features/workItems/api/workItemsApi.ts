import type {
  CreateWorkItemRequest,
  CreateWorkItemResponse,
} from "@repo/contracts";
import { request } from "../../../lib/apiClient";
import { projectApiPath } from "../../projects/api/projectApiPath";

export const workItemsApi = {
  create: (
    slug: string,
    identifier: string,
    body: CreateWorkItemRequest,
    signal?: AbortSignal,
  ): Promise<CreateWorkItemResponse> =>
    request<CreateWorkItemResponse>(
      `${projectApiPath(slug, identifier)}/work-items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    ),
};
