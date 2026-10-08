export interface TimezoneOption {
  value: string;
  label: string;
  offsetMinutes: number | null;
  search: string;
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const hoursStr = String(hours).padStart(2, "0");
  const minsStr = String(mins).padStart(2, "0");
  return `UTC${sign}${hoursStr}:${minsStr}`;
}

export function parseGmtOffset(partValue: string): number | null {
  if (partValue === "GMT" || partValue === "UTC") {
    return 0;
  }

  const match = /^GMT([+-])(\d{1,2}):?(\d{2})?$/.exec(partValue);
  if (!match) {
    return null;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2] ?? "0", 10);
  const mins = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + mins);
}

function getTimezoneOffsetMinutes(timeZone: string, now: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(now);

    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (!tzPart) {
      return null;
    }
    return parseGmtOffset(tzPart.value);
  } catch (err: unknown) {
    if (err instanceof RangeError) {
      console.warn("Unknown time zone", timeZone);
    }
    return null;
  }
}

function createOption(
  zone: string,
  now: Date,
  isCurrentUnknown = false,
): TimezoneOption {
  const offset = getTimezoneOffsetMinutes(zone, now);
  let label: string;

  if (isCurrentUnknown) {
    label =
      offset !== null
        ? `(${formatUtcOffset(offset)}) ${zone} (current)`
        : `${zone} (current)`;
  } else {
    label =
      offset !== null ? `(${formatUtcOffset(offset)}) ${zone}` : zone;
  }

  const normalized = zone.toLowerCase();
  const city = (zone.split("/").pop() ?? "").replace(/_/g, " ").toLowerCase();
  let search = `${normalized} ${city}`;

  if (offset !== null) {
    const utcFormatted = formatUtcOffset(offset).toLowerCase();
    const sign = offset >= 0 ? "+" : "-";
    const hours = Math.floor(Math.abs(offset) / 60);
    const shortOffset = `${sign}${String(hours).padStart(2, "0")}`;
    const shortOffsetNoPad = `${sign}${hours}`;
    search += ` ${utcFormatted} ${shortOffset} ${shortOffsetNoPad}`;
  }

  if (isCurrentUnknown) {
    search += " current";
  }

  return {
    value: zone,
    label,
    offsetMinutes: offset,
    search: search.trim(),
  };
}

export function buildTimezoneOptions(
  zones: readonly string[],
  now: Date,
  currentZone?: string,
): TimezoneOption[] {
  const options = zones.map((z) => createOption(z, now));

  options.sort((a, b) => {
    if (a.offsetMinutes === null && b.offsetMinutes === null) {
      return a.value.localeCompare(b.value);
    }
    if (a.offsetMinutes === null) return 1;
    if (b.offsetMinutes === null) return -1;
    if (a.offsetMinutes !== b.offsetMinutes) {
      return a.offsetMinutes - b.offsetMinutes;
    }
    return a.value.localeCompare(b.value);
  });

  if (currentZone && !zones.includes(currentZone)) {
    const currentOpt = createOption(currentZone, now, true);
    return [currentOpt, ...options];
  }

  return options;
}

let cachedBaseOptions: TimezoneOption[] | null = null;
let cachedBaseDate: number = 0;

export function getCachedBaseTimezoneOptions(
  zones: readonly string[],
  now: Date = new Date(),
): TimezoneOption[] {
  if (
    !cachedBaseOptions ||
    Math.abs(now.getTime() - cachedBaseDate) > 3600_000
  ) {
    cachedBaseOptions = buildTimezoneOptions(zones, now);
    cachedBaseDate = now.getTime();
  }
  return cachedBaseOptions;
}
