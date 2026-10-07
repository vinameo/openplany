import { createHash, createHmac, randomBytes } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;

/** Opaque session token sent in the cookie; only its hash is stored. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex, as stored in sessions.token_hash. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Keyed hash of a normalised email (api-spec 6.3). A plain SHA-256 could be
 * reversed with a list of known emails.
 */
export function hashEmail(secret: string, email: string): string {
  return createHmac('sha256', secret).update(email).digest('hex');
}
