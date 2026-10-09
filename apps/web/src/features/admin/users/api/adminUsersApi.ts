import type { CreatedUserResponse, CreateUserRequest } from "@repo/contracts";
import { request } from "../../../../lib/apiClient";

export const GENERIC_CREATE_USER_ERROR =
  "Couldn't create the user. Please try again.";

export const adminUsersApi = {
  createUser(body: CreateUserRequest): Promise<CreatedUserResponse> {
    return request<CreatedUserResponse>(
      "/api/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      GENERIC_CREATE_USER_ERROR,
    );
  },
};

