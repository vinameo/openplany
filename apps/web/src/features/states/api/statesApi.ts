import type { StateListResponse } from "@repo/contracts";
import { request } from "../../../lib/apiClient";
import { projectApiPath } from "../../projects/api/projectApiPath";

export const statesApi = {
  listProjectStates: (
    slug: string,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<StateListResponse> =>
    request<StateListResponse>(`${projectApiPath(slug, identifier)}/states`, {
      signal,
    }),
};
