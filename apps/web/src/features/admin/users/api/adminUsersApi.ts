import type {
  CreatedUserResponse,
  CreateUserRequest,
  MessageKey,
} from "@repo/contracts";
import { request } from "../../../../lib/apiClient";

export const GENERIC_CREATE_USER_ERROR_KEY: MessageKey =
  "admin:users.errors.createFailed";

export const adminUsersApi = {
  createUser(body: CreateUserRequest): Promise<CreatedUserResponse> {
    return request<CreatedUserResponse>(
      "/api/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      GENERIC_CREATE_USER_ERROR_KEY,
    );
  },
};
