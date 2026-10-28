import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { STATE_COLORS } from "@repo/contracts";
import { StateColorPicker } from "./StateColorPicker";

describe("StateColorPicker", () => {
  it("renders 12 color swatches as a radiogroup", () => {
    render(
      <AppUiProvider>
        <StateColorPicker value={STATE_COLORS[0]} onChange={vi.fn()} />
      </AppUiProvider>,
    );

    const group = screen.getByRole("radiogroup");
    expect(group).toBeInTheDocument();

    const swatches = screen.getAllByRole("radio");
    expect(swatches).toHaveLength(12);
  });

  it("marks the active color with aria-checked and selection indicator", () => {
    const activeColor = STATE_COLORS[2];
    render(
      <AppUiProvider>
        <StateColorPicker value={activeColor} onChange={vi.fn()} />
      </AppUiProvider>,
    );

    const swatches = screen.getAllByRole("radio");
    expect(swatches[2]).toHaveAttribute("aria-checked", "true");
    expect(swatches[0]).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange when a swatch is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppUiProvider>
        <StateColorPicker value={STATE_COLORS[0]} onChange={onChange} />
      </AppUiProvider>,
    );

    const swatches = screen.getAllByRole("radio");
    await user.click(swatches[3]!);

    expect(onChange).toHaveBeenCalledWith(STATE_COLORS[3]);
  });

  it("navigates swatches with arrow keys and wraps around", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppUiProvider>
        <StateColorPicker value={STATE_COLORS[0]} onChange={onChange} />
      </AppUiProvider>,
    );

    const swatches = screen.getAllByRole("radio");
    swatches[0]!.focus();

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(STATE_COLORS[1]);

    swatches[0]!.focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith(
      STATE_COLORS[STATE_COLORS.length - 1],
    );
  });
});
