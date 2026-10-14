import { translate } from "../../i18n/language";

/**
 * Formats rate limit countdown message.
 * n = max(1, ceil(seconds / 60))
 * 90 -> 2 minutes, 30 -> 1 minute, null -> 1 minute, 600 -> 10 minutes.
 */
export function tooManyChangesMessage(retryAfterSeconds: number | null): string {
  const seconds = retryAfterSeconds ?? 60;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return translate("settings:messages.tooManyChanges", { count: minutes });
}

export const SETTINGS_MESSAGES = {
  get readOnly(): string {
    return translate("settings:messages.readOnly");
  },
  get permissionLost(): string {
    return translate("settings:messages.permissionLost");
  },
};
