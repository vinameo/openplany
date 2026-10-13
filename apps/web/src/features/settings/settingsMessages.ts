/**
 * Formats rate limit countdown message.
 * n = max(1, ceil(seconds / 60))
 * 90 -> 2 minutes, 30 -> 1 minute, null -> 1 minute, 600 -> 10 minutes.
 */
export function tooManyChangesMessage(retryAfterSeconds: number | null): string {
  const seconds = retryAfterSeconds ?? 60;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many changes. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

export const SETTINGS_MESSAGES = {
  readOnly: "You don't have permission to change these settings.",
  permissionLost: "You no longer have permission to change these settings.",
} as const;
