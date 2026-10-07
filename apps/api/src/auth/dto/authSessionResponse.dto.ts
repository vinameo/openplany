import type { User } from '../entities/user.entity.js';

export interface AuthUserResponse {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  timezone: string;
  isEmailVerified: boolean;
  isInstanceAdmin: boolean;
}

export interface AuthSessionResponse {
  user: AuthUserResponse;
  requiresPasswordReset: boolean;
}

/** Maps field by field so internal columns can never leak into a response. */
export function toAuthSessionResponse(
  user: User,
  requiresPasswordReset: boolean,
): AuthSessionResponse {
  return {
    user: {
      id: user.id,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      avatarUrl:
        user.avatar !== null && user.avatar !== '' ? user.avatar : null,
      timezone: user.timezone,
      isEmailVerified: user.isEmailVerified,
      isInstanceAdmin: user.isSuperuser,
    },
    requiresPasswordReset,
  };
}
