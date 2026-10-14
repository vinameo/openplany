import { translate } from "../../../i18n/language";

export const PROJECT_SETTINGS_MESSAGES = {
  get identifierReadOnly(): string {
    return translate("project:settings.general.identifierReadOnly");
  },
  get deleteForbidden(): string {
    return translate("project:settings.delete.forbidden");
  },
  get noAccess(): string {
    return translate("project:settings.noAccess");
  },
} as const;
