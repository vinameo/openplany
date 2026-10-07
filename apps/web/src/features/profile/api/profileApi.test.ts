import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { GENERIC_PROFILE_ERROR, profileApi } from "./profileApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profileApi", () => {
  describe("updateMe", () => {
    it("patches only the given fields as JSON and returns the user", async () => {
      const { user } = makeSession();
      const fetchMock = mockFetch({
        "PATCH /api/users/me": () => jsonResponse(200, user),
      });

      await expect(
        profileApi.updateMe({ displayName: "Kai" }),
      ).resolves.toEqual(user);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "PATCH",
        body: JSON.stringify({ displayName: "Kai" }),
        headers: { "Content-Type": "application/json" },
      });
    });

    it("rejects with the field errors of a validation failure", async () => {
      mockFetch({
        "PATCH /api/users/me": () =>
          apiError(400, "VALIDATION_ERROR", "Check the highlighted fields", {
            fields: { firstName: "Enter your first name" },
          }),
      });

      await expect(
        profileApi.updateMe({ firstName: "" }),
      ).rejects.toMatchObject({
        status: 400,
        fields: { firstName: "Enter your first name" },
      });
    });

    it("uses the profile message when the network fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("offline")),
      );

      await expect(
        profileApi.updateMe({ displayName: "Kai" }),
      ).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        message: GENERIC_PROFILE_ERROR,
      });
    });
  });

  describe("getMe", () => {
    it("reads the signed-in user", async () => {
      const { user } = makeSession();
      mockFetch({ "GET /api/users/me": () => jsonResponse(200, user) });

      await expect(profileApi.getMe()).resolves.toEqual(user);
    });
  });
});
