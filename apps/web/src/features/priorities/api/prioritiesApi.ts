import type { PriorityListResponse } from "@repo/contracts";
import { request } from "../../../lib/apiClient";
import { projectApiPath } from "../../projects/api/projectApiPath";

export const prioritiesApi = {
  listProjectPriorities: (
    slug: string,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<PriorityListResponse> =>
    request<PriorityListResponse>(
      `${projectApiPath(slug, identifier)}/priorities`,
      {
        signal,
      },
    ),
};
