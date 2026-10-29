import type { Language } from "@repo/contracts";
import { getLanguage, languageLocale } from "../../../i18n";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Calendar date format with language and timezone support (WEB B6, INV-11). */
export function formatCalendarDate(
  iso: string,
  timeZone?: string,
  lang?: Language,
): string {
  const currentLang = lang ?? getLanguage();
  const key = `${currentLang}:${timeZone ?? "default"}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(languageLocale(currentLang), {
      month: "short",
      day: "2-digit",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
    formatterCache.set(key, formatter);
  }
  return formatter.format(new Date(iso));
}
