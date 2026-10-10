import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RolesResponse,
  UpdateRolePermissionsRequest,
} from "@repo/contracts";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { makeDefaultRolesResponse } from "../test/rolesFixtures";
import {
  adminRolesApi,
  GENERIC_LOAD_ROLES_ERROR,
  GENERIC_UPDATE_ROLES_ERROR,
} from "./adminRolesApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminRolesApi", () => {
  const defaultRolesResponse: RolesResponse = makeDefaultRolesResponse();

  describe("list", () => {
    it("fetches /api/admin/roles with GET and returns RolesResponse", async () => {
      const fetchMock = mockFetch({
        "GET /api/admin/roles": () => jsonResponse(200, defaultRolesResponse),
      });

      const result = await adminRolesApi.list();
      expect(result).toEqual(defaultRolesResponse);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/roles");
    });

    it("rejects with ApiRequestError on failure", async () => {
      mockFetch({
        "GET /api/admin/roles": () =>
          apiError(500, "INTERNAL_ERROR", "Server error"),
      });

      await expect(adminRolesApi.list()).rejects.toMatchObject({
        status: 500,
        code: "INTERNAL_ERROR",
      });
    });

    it("rejects with network error when fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Network down")),
      );

      await expect(adminRolesApi.list()).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        message: GENERIC_LOAD_ROLES_ERROR,
      });
    });
  });

  describe("updatePermissions", () => {
    const updateBody: UpdateRolePermissionsRequest = {
      changes: [
        {
          scope: "workspace",
          key: "member",
          version: 1,
          permissions: ["workspace.settings.view", "workspace.settings.update"],
        },
      ],
    };

    it("sends PATCH to /api/admin/role-permissions with JSON body and returns RolesResponse", async () => {
      const fetchMock = mockFetch({
        "PATCH /api/admin/role-permissions": () =>
          jsonResponse(200, defaultRolesResponse),
      });

      const result = await adminRolesApi.updatePermissions(updateBody);
      expect(result).toEqual(defaultRolesResponse);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "PATCH",
        body: JSON.stringify(updateBody),
        headers: { "Content-Type": "application/json" },
      });
    });

    it("rejects with 409 conflict when permissions were modified concurrently", async () => {
      mockFetch({
        "PATCH /api/admin/role-permissions": () =>
          apiError(
            409,
            "ROLE_PERMISSIONS_CHANGED",
            "Someone else changed these permissions",
          ),
      });

      await expect(
        adminRolesApi.updatePermissions(updateBody),
      ).rejects.toMatchObject({
        status: 409,
        code: "ROLE_PERMISSIONS_CHANGED",
      });
    });

    it("rejects with 400 validation error on guardrail failure", async () => {
      mockFetch({
        "PATCH /api/admin/role-permissions": () =>
          apiError(400, "VALIDATION_ERROR", "Invalid role permissions", {
            fields: { "changes.0": "Scope mismatch" },
          }),
      });

      await expect(
        adminRolesApi.updatePermissions(updateBody),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        fields: { "changes.0": "Scope mismatch" },
      });
    });

    it("rejects with network error when fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Network down")),
      );

      await expect(
        adminRolesApi.updatePermissions(updateBody),
      ).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        message: GENERIC_UPDATE_ROLES_ERROR,
      });
    });
  });
});

