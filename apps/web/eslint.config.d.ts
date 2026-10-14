export interface RestrictedSelector {
  selector: string;
  message: string;
}

export const URL_SELECTORS: RestrictedSelector[];
export const I18N_RESTRICTED_SELECTORS: RestrictedSelector[];
export const ALL_RESTRICTED_SELECTORS: RestrictedSelector[];
export const EXEMPT_AREAS: string[];

export interface RestrictedImportPath {
  name: string;
  importNames?: string[];
  allowTypeImports?: boolean;
  message: string;
}

export const I18N_RESTRICTED_IMPORTS: { paths: RestrictedImportPath[] };

declare const config: unknown;
export default config;
