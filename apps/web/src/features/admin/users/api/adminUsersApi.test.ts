import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AdminUserListResponse,
  CreatedUserResponse,
  CreateUserRequest,
} from "@repo/contracts";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { adminUsersApi, GENERIC_CREATE_USER_ERROR_KEY } from "./adminUsersApi";
import { translate } from "../../../../i18n/language";

const GENERIC_CREATE_USER_ERROR = translate(GENERIC_CREATE_USER_ERROR_KEY);

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

  describe("list", () => {
    it("fetches GET /api/admin/users with mapped query params", async () => {
      const listResponse: AdminUserListResponse = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      };
      const fetchMock = mockFetch({
        "GET /api/admin/users": () => jsonResponse(200, listResponse),
      });

      const result = await adminUsersApi.list({
        search: "kai",
        status: "active",
        admin: "only",
        sort: "createdAt",
        order: "desc",
        page: 2,
      });

      expect(result).toEqual(listResponse);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("page=2");
      expect(calledUrl).toContain("sort=createdAt");
      expect(calledUrl).toContain("order=desc");
      expect(calledUrl).toContain("search=kai");
      expect(calledUrl).toContain("status=active");
      expect(calledUrl).toContain("instanceAdmin=only");
    });
  });

  describe("get", () => {
    it("fetches GET /api/admin/users/:userId", async () => {
      const userResponse = {
        id: "u-1",
        email: "an@openplany.dev",
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        avatarUrl: null,
        isActive: true,
        isInstanceAdmin: false,
        createdAt: "2026-10-09T10:00:00.000Z",
        updatedAt: "2026-10-09T10:00:00.000Z",
      };
      const fetchMock = mockFetch({
        "GET /api/admin/users/u-1": () => jsonResponse(200, userResponse),
      });

      const result = await adminUsersApi.get("u-1");
      expect(result).toEqual(userResponse);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users/u-1");
    });
  });

  describe("update", () => {
    it("patches to /api/admin/users/:userId with JSON body", async () => {
      const updatedResponse = {
        id: "u-1",
        email: "an.new@openplany.dev",
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        avatarUrl: null,
        isActive: true,
        isInstanceAdmin: false,
        createdAt: "2026-10-09T10:00:00.000Z",
        updatedAt: "2026-10-09T11:00:00.000Z",
      };
      const fetchMock = mockFetch({
        "PATCH /api/admin/users/u-1": () => jsonResponse(200, updatedResponse),
      });

      const updateBody = {
        expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
        email: "an.new@openplany.dev",
      };
      const result = await adminUsersApi.update("u-1", updateBody);
      expect(result).toEqual(updatedResponse);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "PATCH",
        body: JSON.stringify(updateBody),
        headers: { "Content-Type": "application/json" },
      });
    });
  });
});
