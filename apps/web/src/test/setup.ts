import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { Language } from "@repo/contracts";
import {
  initLanguage,
  resetLanguageModuleForTest,
  setLanguage,
} from "../i18n/index.js";

// The root `pnpm test` runs the API suite beside this one; under that load
// findBy*/waitFor timed out at the 1 s default and failed tests that pass alone.
configure({ asyncUtilTimeout: 5000 });

// Initialize language synchronously in 'en' for all tests
initLanguage();

export function setTestLanguage(lang: Language): void {
  setLanguage(lang);
}

afterEach(() => {
  cleanup();
  resetLanguageModuleForTest();
  window.localStorage.clear();
});

// jsdom lacks these browser APIs; Mantine components rely on them.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollTo = vi.fn();
