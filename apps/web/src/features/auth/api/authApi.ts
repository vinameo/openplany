import { ApiRequestError, request } from "../../../lib/apiClient";
import type { AuthSession, SignInRequest } from "./authTypes";

export const GENERIC_SIGN_IN_ERROR = "Couldn't sign in. Please try again.";

export const authApi = {
  signIn(values: SignInRequest): Promise<AuthSession> {
    return request<AuthSession>(
      "/api/auth/sign-in",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
      GENERIC_SIGN_IN_ERROR,
    );
  },

  /** Resolves null when nobody is signed in (401). */
  async getSession(): Promise<AuthSession | null> {
    try {
      return await request<AuthSession>(
        "/api/auth/session",
        {},
        GENERIC_SIGN_IN_ERROR,
      );
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 401) return null;
      throw error;
    }
  },

  signOut(): Promise<void> {
    return request<void>(
      "/api/auth/sign-out",
      { method: "POST" },
      GENERIC_SIGN_IN_ERROR,
    );
  },
};
