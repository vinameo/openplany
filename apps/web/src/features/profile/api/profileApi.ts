import type { MessageKey } from "@repo/contracts";
import { request } from "../../../lib/apiClient";
import type { AuthUser, UpdateProfileRequest } from "../../auth/api/authTypes";

export const GENERIC_PROFILE_ERROR_KEY: MessageKey =
  "profile:errors.saveFailed";

export const profileApi = {
  getMe(): Promise<AuthUser> {
    return request<AuthUser>("/api/users/me", {}, GENERIC_PROFILE_ERROR_KEY);
  },

  updateMe(changes: UpdateProfileRequest): Promise<AuthUser> {
    return request<AuthUser>(
      "/api/users/me",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      },
      GENERIC_PROFILE_ERROR_KEY,
    );
  },
};
