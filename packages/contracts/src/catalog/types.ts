import type { en } from "./en.js";

export type EnCatalog = typeof en;

export type ViCatalog = {
  readonly [N in keyof EnCatalog]: {
    readonly [
      K in keyof EnCatalog[N] as K extends `${string}_one` ? never : K
    ]: string;
  };
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

export interface LanguageResources {
  readonly en: EnCatalog;
  readonly vi: ViCatalog;
}
