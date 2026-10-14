import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LANGUAGE_STORAGE_KEY,
  getLanguage,
  initLanguage,
  resetLanguageModuleForTest,
  setLanguage,
  translate,
} from "./language.js";
import { request, ApiRequestError } from "../lib/apiClient.js";

describe("Web Language Module (RQ INV-01, INV-02, INV-09, AC-03, AC-08, AC-09, AC-10)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetLanguageModuleForTest();
    vi.restoreAllMocks();
  });

  it("reads stored language synchronously and sets document.documentElement.lang (AC-03, INV-02)", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "vi");
    initLanguage();

    expect(getLanguage()).toBe("vi");
    expect(document.documentElement.lang).toBe("vi");
  });

  it("normalizes unknown or malformed stored values to en (AC-08)", () => {
    for (const invalid of ["fr", "en-US", "VI", "", "null", "undefined"]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, invalid);
      resetLanguageModuleForTest();
      expect(getLanguage()).toBe("en");
    }
  });

  it("writes raw string to localStorage when language changes and updates document.documentElement.lang", () => {
    setLanguage("vi");
    expect(getLanguage()).toBe("vi");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("vi");
    expect(document.documentElement.lang).toBe("vi");

    // Setting the same language does not re-write or fail
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    setLanguage("vi");
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("handles storage throwing on read and write: defaults to en, keeps in-memory state, warns once per session (AC-09)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock localStorage throwing
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      });

    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      });

    resetLanguageModuleForTest();
    // Try setting language in-memory
    setLanguage("vi");
    expect(getLanguage()).toBe("vi");

    // Second write should not produce a second warning
    setLanguage("en");
    expect(getLanguage()).toBe("en");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("localStorage is unavailable");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("responds to storage event from another tab: valid key, key deleted, key === null (AC-10)", () => {
    initLanguage();
    expect(getLanguage()).toBe("en");

    // Event with key openplany.language -> vi
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: LANGUAGE_STORAGE_KEY,
        newValue: "vi",
      }),
    );
    expect(getLanguage()).toBe("vi");
    expect(document.documentElement.lang).toBe("vi");

    // Key deleted in another tab (newValue === null) -> en
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: LANGUAGE_STORAGE_KEY,
        newValue: null,
      }),
    );
    expect(getLanguage()).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    // Switch to vi, then localStorage.clear() in another tab (key === null) -> en
    setLanguage("vi");
    expect(getLanguage()).toBe("vi");

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
      }),
    );
    expect(getLanguage()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("throws when missing interpolation variable in test mode", () => {
    expect(() => {
      // test.minute_one expects {{count}}
      translate("common:test.minute_one");
    }).toThrow(/Missing interpolation variable/);
  });
});

describe("apiClient language behavior (INV-09, WEB B4)", () => {
  beforeEach(() => {
    resetLanguageModuleForTest();
    vi.restoreAllMocks();
  });

  it("attaches Accept-Language header matching current language and overrides caller header (INV-09)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    setLanguage("vi");
    await request("/api/test", {
      headers: { "Accept-Language": "fr" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.headers["Accept-Language"]).toBe("vi");
  });

  it("translates fallback message when throwing web-generated error in en and vi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );

    // In en
    setLanguage("en");
    await expect(request("/api/test")).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).message).toBe(
        "Something went wrong. Please try again.",
      );
      expect((err as ApiRequestError).code).toBe("NETWORK_ERROR");
      return true;
    });

    // In vi
    setLanguage("vi");
    await expect(request("/api/test")).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).message).toBe(
        "Đã có lỗi xảy ra. Vui lòng thử lại.",
      );
      expect((err as ApiRequestError).code).toBe("NETWORK_ERROR");
      return true;
    });

    // Custom fallback key: auth:errors.signInFailed
    setLanguage("vi");
    await expect(
      request("/api/test", {}, "auth:errors.signInFailed"),
    ).rejects.toSatisfy((err) => {
      expect((err as ApiRequestError).message).toBe(
        "Không thể đăng nhập. Vui lòng thử lại.",
      );
      return true;
    });
  });
});
