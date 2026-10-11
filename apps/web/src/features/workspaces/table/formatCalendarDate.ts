const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** "Oct 08, 2026", en-US calendar date format with timezone support (WEB B2.2). */
export function formatCalendarDate(iso: string, timeZone?: string): string {
  const key = timeZone ?? "default";
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
    formatterCache.set(key, formatter);
  }
  return formatter.format(new Date(iso));
}
