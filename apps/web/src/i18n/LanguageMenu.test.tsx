import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageMenu } from "./LanguageMenu";
import {
  LANGUAGE_STORAGE_KEY,
  getLanguage,
  resetLanguageModuleForTest,
  setLanguage,
} from "./language";

function renderMenu() {
  render(
    <AppUiProvider>
      <LanguageMenu />
    </AppUiProvider>,
  );
  return { user: userEvent.setup() };
}

describe("LanguageMenu (RQ A6, D4, AC-17, WEB B5)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetLanguageModuleForTest();
  });

  it("renders with default English language (EN) and proper aria-label", () => {
    renderMenu();
    const button = screen.getByRole("button", {
      name: "Language: English (EN)",
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("EN");
    expect(button).toHaveAttribute("title", "Language: English (EN)");
  });

  it("opens menu showing native language names with menuitemradio and lang attributes", async () => {
    const { user } = renderMenu();
    const button = screen.getByRole("button", {
      name: "Language: English (EN)",
    });

    await user.click(button);

    const enItem = await screen.findByRole("menuitemradio", {
      name: "English",
    });
    const viItem = screen.getByRole("menuitemradio", { name: "Tiếng Việt" });

    expect(enItem).toBeInTheDocument();
    expect(enItem).toHaveAttribute("lang", "en");
    expect(enItem).toHaveAttribute("aria-checked", "true");

    expect(viItem).toBeInTheDocument();
    expect(viItem).toHaveAttribute("lang", "vi");
    expect(viItem).toHaveAttribute("aria-checked", "false");
  });

  it("switches to Vietnamese when clicking Tiếng Việt", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { user } = renderMenu();

    await user.click(
      screen.getByRole("button", { name: "Language: English (EN)" }),
    );
    const viItem = await screen.findByRole("menuitemradio", {
      name: "Tiếng Việt",
    });
    await user.click(viItem);

    expect(getLanguage()).toBe("vi");
    expect(document.documentElement.lang).toBe("vi");
    expect(setItemSpy).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY, "vi");

    const updatedButton = await screen.findByRole("button", {
      name: "Ngôn ngữ: Tiếng Việt (VI)",
    });
    expect(updatedButton).toBeInTheDocument();
    expect(updatedButton).toHaveTextContent("VI");
    expect(updatedButton).toHaveAttribute("title", "Ngôn ngữ: Tiếng Việt (VI)");

    setItemSpy.mockRestore();
  });

  it("does not write to storage when clicking the currently active language", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { user } = renderMenu();

    await user.click(
      screen.getByRole("button", { name: "Language: English (EN)" }),
    );
    const enItem = await screen.findByRole("menuitemradio", {
      name: "English",
    });

    await user.click(enItem);

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("reacts to cross-tab storage changes (AC-10)", async () => {
    renderMenu();
    expect(
      screen.getByRole("button", { name: "Language: English (EN)" }),
    ).toHaveTextContent("EN");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LANGUAGE_STORAGE_KEY,
          newValue: "vi",
        }),
      );
    });

    const updatedButton = await screen.findByRole("button", {
      name: "Ngôn ngữ: Tiếng Việt (VI)",
    });
    expect(updatedButton).toBeInTheDocument();
    expect(updatedButton).toHaveTextContent("VI");
    expect(document.documentElement.lang).toBe("vi");
  });

  it("renders correctly when starting in Vietnamese", () => {
    setLanguage("vi");
    renderMenu();

    const button = screen.getByRole("button", {
      name: "Ngôn ngữ: Tiếng Việt (VI)",
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("VI");
  });
});
