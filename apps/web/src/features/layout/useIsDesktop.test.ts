import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "../../test/mediaQuery";
import { useIsDesktop } from "./useIsDesktop";

describe("useIsDesktop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false by default with default matchMedia stub", () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("returns true when stubMatchMedia(true) is called", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });
});
