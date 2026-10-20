import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { GENERIC_PROFILE_ERROR_KEY, profileApi } from "./profileApi";
import { translate } from "../../../i18n/language";

const GENERIC_PROFILE_ERROR = translate(GENERIC_PROFILE_ERROR_KEY);

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

  describe("changePassword", () => {
    it("puts current and new password and returns the renewed session", async () => {
      const session = makeSession();
      const fetchMock = mockFetch({
        "PUT /api/users/me/password": () => jsonResponse(200, session),
      });

      const body = {
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword456!",
      };
      await expect(profileApi.changePassword(body)).resolves.toEqual(session);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    });
  });
});
