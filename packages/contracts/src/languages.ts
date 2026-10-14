export const SUPPORTED_LANGUAGES = ["en", "vi"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en";

export const NATIVE_LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  vi: "Tiếng Việt",
} as const;

/**
 * Normalizes a raw value retrieved from browser storage (e.g. localStorage['openplany.language']).
 * Per RQ B4.1 / INV-01:
 * - Exact case-sensitive match on SUPPORTED_LANGUAGES is accepted.
 * - Leading/trailing spaces, differing case, JSON quotes, invalid languages, empty values -> DEFAULT_LANGUAGE ('en').
 */
export function storedLanguage(raw: unknown): Language {
  if (
    typeof raw === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)
  ) {
    return raw as Language;
  }
  return DEFAULT_LANGUAGE;
}

const RFC9110_QVALUE_REGEX = /^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/;
function hasInvalidHeaderControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Disallow NUL and control characters (0-8, 10-31, 127); allow horizontal tab (9)
    if (code <= 8 || (code >= 10 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Parses and normalizes the HTTP Accept-Language request header per RFC 9110 & API B3, B6.
 * - Header must be a string, <= 256 characters, without control characters / NUL.
 * - Evaluates comma-separated language ranges with qvalues.
 * - Extracts the primary subtag (e.g. 'vi-VN' -> 'vi', case-insensitive).
 * - Filters for SUPPORTED_LANGUAGES, rejects malformed qvalue or q=0.
 * - Picks the supported language with the highest qvalue; on tie, the earlier one in the header wins.
 * - Falls back to DEFAULT_LANGUAGE ('en').
 */
export function languageFromAcceptLanguage(header: unknown): Language {
  if (typeof header !== "string") {
    return DEFAULT_LANGUAGE;
  }
  if (header.length === 0 || header.length > 256) {
    return DEFAULT_LANGUAGE;
  }
  if (hasInvalidHeaderControlChars(header)) {
    return DEFAULT_LANGUAGE;
  }

  const parts = header.split(",");
  let bestLanguage: Language = DEFAULT_LANGUAGE;
  let bestQ = -1;

  for (let i = 0; i < parts.length; i++) {
    const rawPart = parts[i];
    const params = rawPart.split(";");
    const rawTag = params[0].trim();
    if (!rawTag || rawTag === "*") {
      continue;
    }

    const firstSubtag = rawTag.split("-")[0].trim().toLowerCase();
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(firstSubtag)) {
      continue;
    }

    let q = 1.0;
    let validQ = true;

    for (let j = 1; j < params.length; j++) {
      const param = params[j].trim();
      const eqIdx = param.indexOf("=");
      if (eqIdx === -1) {
        continue;
      }
      const paramName = param.slice(0, eqIdx).trim().toLowerCase();
      const paramVal = param.slice(eqIdx + 1).trim();

      if (paramName === "q") {
        if (!RFC9110_QVALUE_REGEX.test(paramVal)) {
          validQ = false;
          break;
        }
        const parsedQ = Number(paramVal);
        if (parsedQ === 0) {
          validQ = false;
          break;
        }
        q = parsedQ;
      }
    }

    if (!validQ) {
      continue;
    }

    if (q > bestQ) {
      bestQ = q;
      bestLanguage = firstSubtag as Language;
    }
  }

  return bestQ > 0 ? bestLanguage : DEFAULT_LANGUAGE;
}
