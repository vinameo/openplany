import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  LANGUAGE_RESOURCES,
  storedLanguage,
  type Language,
  type MessageKey,
} from '@repo/contracts';

export const LANGUAGE_STORAGE_KEY = 'openplany.language';

let currentLanguage: Language = 'en';
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
    return 'en';
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
    const newLang = event.newValue === null ? 'en' : storedLanguage(event.newValue);
    if (newLang !== currentLanguage) {
      applyLanguage(newLang, false);
    }
  } else if (event.key === null) {
    // localStorage.clear() in another tab
    if (currentLanguage !== 'en') {
      applyLanguage('en', false);
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
  const initialLang = typeof window !== 'undefined' ? readStoredLanguage() : 'en';
  currentLanguage = initialLang;

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = initialLang;
  }

  void i18next.use(initReactI18next).init({
    resources: LANGUAGE_RESOURCES as unknown as Resource,
    lng: initialLang,
    fallbackLng: 'en',
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

export function translate(key: MessageKey, params?: Record<string, string | number>): string {
  if (!isInitialized) {
    initLanguage();
  }
  return i18next.t(key, {
    lng: currentLanguage,
    ...params,
  });
}

export function formatNumber(value: number, lang?: Language): string {
  const currentLang = lang ?? getLanguage();
  return new Intl.NumberFormat(currentLang === "vi" ? "vi-VN" : "en-US").format(value);
}

export function resetLanguageModuleForTest(): void {
  currentLanguage = 'en';
  hasWarnedStorage = false;
  isInitialized = false;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = 'en';
  }
  void i18next.changeLanguage('en');
}

export { i18next };
