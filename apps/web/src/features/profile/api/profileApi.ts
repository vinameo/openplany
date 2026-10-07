import { request } from "../../../lib/apiClient";
import type { AuthUser, UpdateProfileRequest } from "../../auth/api/authTypes";

export const GENERIC_PROFILE_ERROR =
  "Couldn't save your profile. Please try again.";

export const profileApi = {
  getMe(): Promise<AuthUser> {
    return request<AuthUser>("/api/users/me", {}, GENERIC_PROFILE_ERROR);
  },

  updateMe(changes: UpdateProfileRequest): Promise<AuthUser> {
    return request<AuthUser>(
      "/api/users/me",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      },
      GENERIC_PROFILE_ERROR,
    );
  },
};
