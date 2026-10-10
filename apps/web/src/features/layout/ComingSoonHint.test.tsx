import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "../../test/mediaQuery";
import { ComingSoonHint } from "./ComingSoonHint";

describe("ComingSoonHint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("desktop", () => {
    beforeEach(() => {
      stubMatchMedia(true);
    });

    it("shows 'Coming soon' tooltip when child element receives focus", async () => {
      const user = userEvent.setup();
      render(
        <AppUiProvider>
          <ComingSoonHint>
            {(trigger) => (
              <button type="button" onClick={trigger.onClick}>
                Action
              </button>
            )}
          </ComingSoonHint>
        </AppUiProvider>,
      );

      const button = screen.getByRole("button", { name: "Action" });
      await user.tab();
      expect(button).toHaveFocus();

      expect(await screen.findByRole("tooltip", { name: "Coming soon" })).toBeInTheDocument();
    });
  });

  describe("mobile", () => {
    beforeEach(() => {
      // default stub in test/setup is mobile
      vi.useFakeTimers();
    });

    it("AC-24: tap shows role='status' bubble, disappears after 2000ms, resets 2000ms timer if tapped again at 1500ms", () => {
      render(
        <AppUiProvider>
          <ComingSoonHint>
            {(trigger) => (
              <button type="button" onClick={trigger.onClick}>
                Action
              </button>
            )}
          </ComingSoonHint>
        </AppUiProvider>,
      );

      const button = screen.getByRole("button", { name: "Action" });

      // Tap initially
      act(() => {
        fireEvent.click(button);
      });

      const statusEl = screen.getByRole("status");
      expect(statusEl).toHaveTextContent("Coming soon");

      // Advance 1500ms -> still visible
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByRole("status")).toHaveTextContent("Coming soon");

      // Tap again at 1500ms -> resets timer to 2000ms from now
      act(() => {
        fireEvent.click(button);
      });

      // Advance 1500ms (total 3000ms from start) -> still visible
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByRole("status")).toHaveTextContent("Coming soon");

      // Advance another 501ms (total 3501ms from start, >2000ms from second tap) -> disappears
      act(() => {
        vi.advanceTimersByTime(501);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
