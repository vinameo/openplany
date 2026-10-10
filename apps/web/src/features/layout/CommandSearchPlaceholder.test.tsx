import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "../../test/mediaQuery";
import { CommandSearchPlaceholder } from "./CommandSearchPlaceholder";

describe("CommandSearchPlaceholder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("desktop", () => {
    beforeEach(() => {
      stubMatchMedia(true);
    });

    it("AC-18: renders button with aria-disabled, no textbox, focus shows tooltip", async () => {
      const user = userEvent.setup();
      render(
        <AppUiProvider>
          <CommandSearchPlaceholder />
        </AppUiProvider>,
      );

      const btn = screen.getByRole("button", {
        name: "Search commands (coming soon)",
      });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("Search commands…")).toBeInTheDocument();

      // Focus -> tooltip
      await user.tab();
      expect(btn).toHaveFocus();
      expect(await screen.findByRole("tooltip", { name: "Coming soon" })).toBeInTheDocument();
    });
  });

  describe("mobile", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("AC-19: renders icon button only without text label, tap shows Coming soon for 2000ms", () => {
      render(
        <AppUiProvider>
          <CommandSearchPlaceholder />
        </AppUiProvider>,
      );

      const btn = screen.getByRole("button", {
        name: "Search commands (coming soon)",
      });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute("aria-disabled", "true");

      // No text label on mobile
      expect(screen.queryByText(/search commands/i)).not.toBeInTheDocument();

      // Tap -> status appears
      act(() => {
        fireEvent.click(btn);
      });

      const statusEl = screen.getByRole("status");
      expect(statusEl).toHaveTextContent("Coming soon");

      // After 2000ms -> disappears
      act(() => {
        vi.advanceTimersByTime(2001);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
