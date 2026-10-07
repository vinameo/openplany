import type { AuthSession } from "./api/authTypes";

export const SIGN_IN_PATH = "/sign-in";
export const SET_PASSWORD_PATH = "/set-password";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const HOME_PATH = "/";

/** Where a signed-in user belongs: a reset-only session can only set a password. */
export function sessionDestination(session: AuthSession): string {
  return session.requiresPasswordReset ? SET_PASSWORD_PATH : HOME_PATH;
}
