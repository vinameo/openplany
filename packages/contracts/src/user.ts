export const USER_NAME_MAX = 50;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Control (Cc) and invisible format (Cf) characters, zero-width spaces included. */
export const USER_NAME_ALLOWED = /^[^\p{Cc}\p{Cf}]*$/u;

/** NFC + trim. Same cleanup on web and server. */
export function normalizeName(value: string): string {
  return value.normalize('NFC').trim();
}

/** "First Last" from normalized parts, skipping empty ones. "" when both are empty. */
export function fullName(firstName: string, lastName: string): string {
  const parts = [normalizeName(firstName), normalizeName(lastName)].filter(
    (part) => part !== '',
  );
  return parts.join(' ');
}

export interface CreateUserRequest {
  firstName: string;
  lastName?: string;
  displayName: string;
  email: string;
  password: string;
}

export interface CreatedUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  isInstanceAdmin: false;
  createdAt: string; // ISO 8601
}

