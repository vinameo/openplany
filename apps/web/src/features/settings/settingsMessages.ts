import { translate } from "../../i18n/language";
import { retryAfterMinutes } from "../../lib/apiClient";

/** Rate limit message with the minutes to wait (`retryAfterMinutes`). */
export function tooManyChangesMessage(retryAfterSeconds: number | null): string {
  return translate("settings:messages.tooManyChanges", {
    count: retryAfterMinutes(retryAfterSeconds),
  });
}

export const SETTINGS_MESSAGES = {
  get readOnly(): string {
    return translate("settings:messages.readOnly");
  },
  get permissionLost(): string {
    return translate("settings:messages.permissionLost");
  },
};
