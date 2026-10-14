import type { Language } from "../languages.js";
import type { en } from "./en.js";

/** The source catalog: every key, with English's `_one`/`_other` plural pairs. */
export type EnCatalog = typeof en;

/** CLDR plural categories; i18next picks the ones a language uses from Intl.PluralRules. */
type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

type PluralBase<K extends string> = K extends `${infer Base}_other`
  ? Base
  : never;
type SingularKey<K extends string> = K extends
  `${string}_one` | `${string}_other`
  ? never
  : K;

type TranslatedNamespace<Keys extends string> = {
  readonly [K in SingularKey<Keys>]: string;
} & {
  readonly [K in `${PluralBase<Keys>}_other`]: string;
} & {
  readonly [
    K in `${PluralBase<Keys>}_${Exclude<PluralCategory, "other">}`
  ]?: string;
};

/**
 * A catalog in a language other than English: every English key, and for each
 * plural key the `_other` form plus whichever other plural forms the language
 * has (`_one` in English, `_few`/`_many` in Polish, none in Vietnamese).
 */
export type TranslatedCatalog = {
  readonly [N in keyof EnCatalog]: TranslatedNamespace<
    Extract<keyof EnCatalog[N], string>
  >;
};

type StripPluralSuffix<K extends string> = K extends `${infer Base}_one`
  ? Base
  : K extends `${infer Base}_other`
    ? Base
    : K;

export type MessageKey = {
  [N in keyof EnCatalog]: `${Extract<N, string>}:${
    | Extract<keyof EnCatalog[N], string>
    | StripPluralSuffix<Extract<keyof EnCatalog[N], string>>}`;
}[keyof EnCatalog];

export interface MessageRef {
  key: MessageKey;
  params?: Record<string, string | number>;
}

/** One catalog per supported language: adding a language to SUPPORTED_LANGUAGES requires its catalog. */
export type LanguageResources = { readonly en: EnCatalog } & {
  readonly [L in Exclude<Language, "en">]: TranslatedCatalog;
};
