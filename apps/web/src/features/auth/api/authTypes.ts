// Mirrors apps/api/src/auth/dto/authSessionResponse.dto.ts. Moves to
// @repo/contracts (Zod) once that package exists (W6).

export interface AuthUser {
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

export interface AuthSession {
  user: AuthUser;
  requiresPasswordReset: boolean;
}

export interface SignInRequest {
  email: string;
  password: string;
}

/** PATCH /api/users/me: only the fields that changed. */
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}
