import type { AuthSession } from "../features/auth/api/authTypes";

export function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: {
      id: "user-1",
      email: "an@openplany.dev",
      displayName: "An Nguyen",
      firstName: "An",
      lastName: "Nguyen",
      avatarUrl: null,
      timezone: "Asia/Ho_Chi_Minh",
      isEmailVerified: true,
      isInstanceAdmin: false,
    },
    requiresPasswordReset: false,
    ...overrides,
  };
}
