import { en } from "./en.js";
import { vi } from "./vi.js";
import type { LanguageResources } from "./types.js";

export * from "./types.js";
export { en } from "./en.js";
export { vi } from "./vi.js";

export const LANGUAGE_RESOURCES: LanguageResources = {
  en,
  vi,
} as const;
