import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { WorkItemPropertyChips } from "./WorkItemPropertyChips";

describe("WorkItemPropertyChips", () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const renderChips = () => {
    return render(
      <AppUiProvider>
        <WorkItemPropertyChips />
      </AppUiProvider>,
    );
  };

  it("renders all 7 chips in the exact RQ D2 order with D3 neutral labels", () => {
    renderChips();

    const expectedLabels = [
      "State",
      "Priority",
      "Assignees",
      "Labels",
      "Start date",
      "Due date",
      "Add parent",
    ];

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);

    expectedLabels.forEach((label, index) => {
      expect(buttons[index]).toHaveTextContent(label);
    });
  });

  it("marks all chips as aria-disabled, focusable, and non-submitting", () => {
    renderChips();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);

    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn).toHaveAttribute("tabindex", "0");
      expect(btn).toHaveAttribute("type", "button");
    });
  });

  it("is wrapped in ComingSoonHint which shows tooltip on hover/focus", async () => {
    const user = userEvent.setup();
    renderChips();

    const stateChip = screen.getByRole("button", { name: "State" });
    await user.hover(stateChip);

    // ComingSoonHint shows "Coming soon" tooltip
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });
});
