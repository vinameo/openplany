import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreatedUserResponse, CreateUserRequest } from "@repo/contracts";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import {
  adminUsersApi,
  GENERIC_CREATE_USER_ERROR,
} from "./adminUsersApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminUsersApi", () => {
  const requestBody: CreateUserRequest = {
    firstName: "An",
    lastName: "Nguyen",
    displayName: "An Nguyen",
    email: "an@openplany.dev",
    password: "secretPassword123",
  };

  const responseBody: CreatedUserResponse = {
    id: "user-uuid-1",
    firstName: "An",
    lastName: "Nguyen",
    displayName: "An Nguyen",
    email: "an@openplany.dev",
    isInstanceAdmin: false,
    createdAt: "2026-10-09T10:00:00.000Z",
  };

  it("posts to /api/admin/users with json body and returns CreatedUserResponse", async () => {
    const fetchMock = mockFetch({
      "POST /api/admin/users": () => jsonResponse(201, responseBody),
    });

    const result = await adminUsersApi.createUser(requestBody);

    expect(result).toEqual(responseBody);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("rejects with ApiRequestError on validation error", async () => {
    mockFetch({
      "POST /api/admin/users": () =>
        apiError(400, "VALIDATION_ERROR", "Check the highlighted fields", {
          fields: { email: "Enter a valid email" },
        }),
    });

    await expect(adminUsersApi.createUser(requestBody)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { email: "Enter a valid email" },
    });
  });

  it("rejects with network error when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(adminUsersApi.createUser(requestBody)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: GENERIC_CREATE_USER_ERROR,
    });
  });
});

