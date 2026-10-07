// Mirrors apps/api/src/auth/dto/authSessionResponse.dto.ts and the api-spec 2.1
// error shape. Moves to @repo/contracts (Zod) once that package exists (W6).

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

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
}
