import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { makeDefaultRolesResponse } from "./test/rolesFixtures";
import { useRolePermissions } from "./useRolePermissions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRolePermissions", () => {
  const defaultRolesResponse = makeDefaultRolesResponse();

  it("transitions from loading to ready when GET succeeds", async () => {
    mockFetch({
      "GET /api/admin/roles": () => jsonResponse(200, defaultRolesResponse),
    });

    const { result } = renderHook(() => useRolePermissions());

    expect(result.current.state.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.state.status).toBe("ready");
    });

    if (result.current.state.status === "ready") {
      expect(result.current.state.roles).toEqual(defaultRolesResponse.roles);
      expect(result.current.state.permissions).toEqual(
        defaultRolesResponse.permissions,
      );
    }
  });

  it("transitions from loading to error and recovers with reload", async () => {
    let shouldFail = true;
    mockFetch({
      "GET /api/admin/roles": () => {
        if (shouldFail) {
          return apiError(500, "SERVER_ERROR", "Internal Server Error");
        }
        return jsonResponse(200, defaultRolesResponse);
      },
    });

    const { result } = renderHook(() => useRolePermissions());

    await waitFor(() => {
      expect(result.current.state.status).toBe("error");
    });

    // Trigger reload
    shouldFail = false;
    act(() => {
      result.current.reload();
    });

    expect(result.current.state.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.state.status).toBe("ready");
    });
  });

  describe("save", () => {
    it("returns saved and updates roles on 200", async () => {
      mockFetch({
        "GET /api/admin/roles": () => jsonResponse(200, defaultRolesResponse),
        "PATCH /api/admin/role-permissions": () => {
          const updated = makeDefaultRolesResponse();
          const member = updated.roles.find(
            (r) => r.scope === "workspace" && r.key === "member",
          )!;
          (member.permissions as string[]).push("workspace.settings.update");
          member.version = 2;
          return jsonResponse(200, updated);
        },
      });

      const { result } = renderHook(() => useRolePermissions());
      await waitFor(() => expect(result.current.state.status).toBe("ready"));

      let saveRes;
      await act(async () => {
        saveRes = await result.current.save({ changes: [] });
      });

      expect(saveRes).toEqual({ status: "saved" });
      if (result.current.state.status === "ready") {
        expect(result.current.state.permissions).toEqual(
          defaultRolesResponse.permissions,
        );
        const member = result.current.state.roles.find(
          (r) => r.scope === "workspace" && r.key === "member",
        );
        expect(member?.version).toBe(2);
      }
    });

    it("returns conflict on 409 ROLE_PERMISSIONS_CHANGED", async () => {
      mockFetch({
        "GET /api/admin/roles": () => jsonResponse(200, defaultRolesResponse),
        "PATCH /api/admin/role-permissions": () =>
          apiError(
            409,
            "ROLE_PERMISSIONS_CHANGED",
            "Someone else changed these permissions",
          ),
      });

      const { result } = renderHook(() => useRolePermissions());
      await waitFor(() => expect(result.current.state.status).toBe("ready"));

      let saveRes;
      await act(async () => {
        saveRes = await result.current.save({ changes: [] });
      });

      expect(saveRes).toEqual({ status: "conflict" });
    });

    it("returns invalid on 400 VALIDATION_ERROR with fields", async () => {
      mockFetch({
        "GET /api/admin/roles": () => jsonResponse(200, defaultRolesResponse),
        "PATCH /api/admin/role-permissions": () =>
          apiError(400, "VALIDATION_ERROR", "Check inputs", {
            fields: { "changes.0": "Scope mismatch" },
          }),
      });

      const { result } = renderHook(() => useRolePermissions());
      await waitFor(() => expect(result.current.state.status).toBe("ready"));

      let saveRes;
      await act(async () => {
        saveRes = await result.current.save({ changes: [] });
      });

      expect(saveRes).toEqual({
        status: "invalid",
        fields: { "changes.0": "Scope mismatch" },
      });
    });

    it("returns failed on unexpected error", async () => {
      mockFetch({
        "GET /api/admin/roles": () => jsonResponse(200, defaultRolesResponse),
        "PATCH /api/admin/role-permissions": () =>
          apiError(500, "INTERNAL_ERROR", "Something went wrong"),
      });

      const { result } = renderHook(() => useRolePermissions());
      await waitFor(() => expect(result.current.state.status).toBe("ready"));

      let saveRes;
      await act(async () => {
        saveRes = await result.current.save({ changes: [] });
      });

      expect(saveRes).toEqual({
        status: "failed",
        message: "Something went wrong",
      });
    });
  });
});

