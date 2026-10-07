import type { AuthUser } from "../auth/api/authTypes";

/** The name shown in the head bar and greeting: display name, else email. */
export function userLabel(
  user: Pick<AuthUser, "displayName" | "email">,
): string {
  return user.displayName !== "" ? user.displayName : user.email;
}
