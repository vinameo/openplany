import i18next, { type Resource, type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_LOCALES,
  LANGUAGE_RESOURCES,
  storedLanguage,
  type Language,
  type MessageKey,
  type MessageRef,
} from '@repo/contracts';

export const LANGUAGE_STORAGE_KEY = 'openplany.language';

let currentLanguage: Language = DEFAULT_LANGUAGE;
let hasWarnedStorage = false;
let isInitialized = false;

function warnStorageUnavailable(operation: 'read' | 'write', error: unknown): void {
  if (!hasWarnedStorage) {
    hasWarnedStorage = true;
    console.warn(
      `localStorage is unavailable for language preference (${operation}): falling back to in-memory state.`,
      error,
    );
  }
}

function readStoredLanguage(): Language {
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return storedLanguage(raw);
  } catch (error) {
    warnStorageUnavailable('read', error);
    return DEFAULT_LANGUAGE;
  }
}

function writeStoredLanguage(lang: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    warnStorageUnavailable('write', error);
  }
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key === LANGUAGE_STORAGE_KEY) {
    const newLang = event.newValue === null ? DEFAULT_LANGUAGE : storedLanguage(event.newValue);
    if (newLang !== currentLanguage) {
      applyLanguage(newLang, false);
    }
  } else if (event.key === null) {
    // localStorage.clear() in another tab
    if (currentLanguage !== DEFAULT_LANGUAGE) {
      applyLanguage(DEFAULT_LANGUAGE, false);
    }
  }
}

function applyLanguage(lang: Language, persist: boolean): void {
  currentLanguage = lang;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }
  void i18next.changeLanguage(lang);
  if (persist) {
    writeStoredLanguage(lang);
  }
}

export function initLanguage(): void {
  if (isInitialized) return;
  const initialLang = typeof window !== 'undefined' ? readStoredLanguage() : DEFAULT_LANGUAGE;
  currentLanguage = initialLang;

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = initialLang;
  }

  void i18next.use(initReactI18next).init({
    resources: LANGUAGE_RESOURCES as unknown as Resource,
    lng: initialLang,
    fallbackLng: DEFAULT_LANGUAGE,
    keySeparator: false,
    nsSeparator: ':',
    interpolation: {
      escapeValue: false,
    },
    missingInterpolationHandler: (text: string) => {
      if (import.meta.env.MODE === 'test') {
        throw new Error(`Missing interpolation variable in translation: ${text}`);
      }
    },
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  isInitialized = true;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(newLang: Language): void {
  if (!isInitialized) {
    initLanguage();
  }
  if (newLang === currentLanguage) return;
  applyLanguage(newLang, true);
}

/**
 * `t` for a key chosen at runtime. The typed overloads check a literal key's
 * own interpolation params; a key from a variable (a MessageRef) would have to
 * satisfy the params of every key at once.
 */
type RuntimeKeyT = (key: MessageKey, options?: Record<string, string | number>) => string;

/** Translates a MessageRef with a component's `t`, so it re-renders on a language change. */
export function translateRef(t: TFunction, ref: MessageRef): string {
  return (t as unknown as RuntimeKeyT)(ref.key, ref.params);
}

export function translate(key: MessageKey, params?: Record<string, string | number>): string {
  if (!isInitialized) {
    initLanguage();
  }
  return (i18next.t as unknown as RuntimeKeyT)(key, {
    lng: currentLanguage,
    ...params,
  });
}

/** Intl locale of a language (current language by default). */
export function languageLocale(lang: Language = getLanguage()): string {
  return LANGUAGE_LOCALES[lang];
}

export function formatNumber(value: number, lang?: Language): string {
  return new Intl.NumberFormat(languageLocale(lang)).format(value);
}

export function resetLanguageModuleForTest(): void {
  currentLanguage = DEFAULT_LANGUAGE;
  hasWarnedStorage = false;
  isInitialized = false;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = DEFAULT_LANGUAGE;
  }
  void i18next.changeLanguage(DEFAULT_LANGUAGE);
}

export { i18next };
