import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { ApiRequestError, authApi, GENERIC_SIGN_IN_ERROR } from "./authApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authApi", () => {
  describe("signIn", () => {
    it("posts the credentials as JSON and returns the session", async () => {
      const session = makeSession();
      const fetchMock = mockFetch({
        "POST /api/auth/sign-in": () => jsonResponse(200, session),
      });

      await expect(
        authApi.signIn({ email: "an@openplany.dev", password: "pw" }),
      ).resolves.toEqual(session);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        body: JSON.stringify({ email: "an@openplany.dev", password: "pw" }),
        headers: { "Content-Type": "application/json" },
      });
    });

    it("rejects with the code, fields and retry delay from the error body", async () => {
      mockFetch({
        "POST /api/auth/sign-in": () =>
          apiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts.", {
            retryAfterSeconds: 600,
          }),
      });

      const error: unknown = await authApi
        .signIn({ email: "a@b.co", password: "x" })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({
        status: 429,
        code: "TOO_MANY_ATTEMPTS",
        message: "Too many attempts.",
        retryAfterSeconds: 600,
        fields: {},
      });
    });

    it("falls back to the generic message when the network fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("offline")),
      );

      await expect(
        authApi.signIn({ email: "a@b.co", password: "x" }),
      ).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        message: GENERIC_SIGN_IN_ERROR,
      });
    });

    it("falls back to the generic message when the body is not JSON", async () => {
      mockFetch({
        "POST /api/auth/sign-in": () =>
          new Response("<html>Bad gateway</html>", { status: 502 }),
      });

      await expect(
        authApi.signIn({ email: "a@b.co", password: "x" }),
      ).rejects.toMatchObject({ status: 502, message: GENERIC_SIGN_IN_ERROR });
    });
  });

  describe("getSession", () => {
    it("resolves null when nobody is signed in", async () => {
      mockFetch({
        "GET /api/auth/session": () =>
          apiError(401, "UNAUTHENTICATED", "Sign in to continue"),
      });

      await expect(authApi.getSession()).resolves.toBeNull();
    });

    it("rethrows other failures", async () => {
      mockFetch({
        "GET /api/auth/session": () =>
          apiError(500, "INTERNAL_ERROR", "Something went wrong"),
      });

      await expect(authApi.getSession()).rejects.toMatchObject({ status: 500 });
    });
  });

  describe("signOut", () => {
    it("resolves on 204", async () => {
      mockFetch({
        "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
      });

      await expect(authApi.signOut()).resolves.toBeUndefined();
    });
  });
});
