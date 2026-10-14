import i18next, { type i18n, type Resource } from 'i18next';
import {
  LANGUAGE_RESOURCES,
  type Language,
  type MessageRef,
} from '@repo/contracts';

const i18nInstance: i18n = i18next.createInstance();

void i18nInstance.init({
  resources: LANGUAGE_RESOURCES as unknown as Resource,
  lng: 'en',
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: ':',
  interpolation: {
    escapeValue: false,
  },
  missingInterpolationHandler: (text: string) => {
    if (process.env.NODE_ENV === 'test') {
      throw new Error(`Missing interpolation variable in translation: ${text}`);
    }
  },
});

/**
 * Translates a MessageRef for the specified language.
 * Never changes the global language state of i18nInstance.
 */
export function translateMessageRef(ref: MessageRef, lang: Language): string {
  return i18nInstance.t(ref.key, {
    lng: lang,
    ...ref.params,
  });
}

/**
 * Checks whether a key exists in the dictionary for the specified language.
 */
export function hasMessageKey(key: string, lang: Language): boolean {
  return i18nInstance.exists(key, { lng: lang });
}

export { i18nInstance };
