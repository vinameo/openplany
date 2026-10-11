import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectIconName } from "@repo/contracts";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { ProjectIconPicker } from "./ProjectIconPicker";

function TestIconPickerWrapper({
  initialValue = { name: "square-check" as ProjectIconName, color: "#868E96" },
  onChange = vi.fn(),
}: {
  initialValue?: { name: ProjectIconName; color: string };
  onChange?: (val: { name: ProjectIconName; color: string }) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <AppUiProvider>
      <ProjectIconPicker
        value={value}
        onChange={(val) => {
          setValue(val);
          onChange(val);
        }}
      >
        {({ onClick }) => (
          <button type="button" aria-label="Change icon" onClick={onClick}>
            Trigger
          </button>
        )}
      </ProjectIconPicker>
    </AppUiProvider>
  );
}

describe("ProjectIconPicker", () => {
  it("opens popover when trigger is clicked and displays color presets and icon grid", async () => {
    const user = userEvent.setup();
    render(<TestIconPickerWrapper />);

    expect(screen.queryByRole("radiogroup", { name: "Icon color" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change icon" }));

    expect(screen.getByRole("radiogroup", { name: "Icon color" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Icon" })).toBeInTheDocument();
    expect(
      screen.getByText(/Colors will be adjusted to ensure sufficient contrast/),
    ).toBeInTheDocument();
  });

  it("selects preset color when a swatch is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TestIconPickerWrapper onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));

    const cyanSwatch = screen.getByRole("radio", { name: "Cyan" });
    await user.click(cyanSwatch);

    expect(onChange).toHaveBeenCalledWith({
      name: "square-check",
      color: "#15AABF",
    });
  });

  it("opens custom color input on # button click and applies valid hex code #1A2B3C", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TestIconPickerWrapper onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));

    const hashBtn = screen.getByRole("button", { name: "Custom color picker" });
    await user.click(hashBtn);

    const hexInput = screen.getByRole("textbox", { name: "Custom color" });
    expect(hexInput).toBeInTheDocument();

    await user.clear(hexInput);
    await user.type(hexInput, "#1a2b3c");

    expect(onChange).toHaveBeenCalledWith({
      name: "square-check",
      color: "#1A2B3C",
    });
  });

  it("filters icons when typing into the search input", async () => {
    const user = userEvent.setup();
    render(<TestIconPickerWrapper />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));

    const searchInput = screen.getByRole("textbox", { name: "Search icons" });
    await user.type(searchInput, "rocket");

    expect(screen.getByRole("radio", { name: "rocket" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "home" })).not.toBeInTheDocument();
  });

  it("navigates icons with arrow keys and selects via Enter/Space without closing popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TestIconPickerWrapper onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));

    // The selected icon starts with tabIndex=0
    const initialIcon = screen.getByRole("radio", { name: "square check" });
    expect(initialIcon).toHaveAttribute("tabindex", "0");

    // Press ArrowRight to move to circle check
    fireEvent.keyDown(initialIcon, { key: "ArrowRight" });
    const nextIcon = screen.getByRole("radio", { name: "circle check" });
    expect(nextIcon).toHaveFocus();

    // Select with Enter
    fireEvent.keyDown(nextIcon, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "circle-check" }),
    );

    // Popover is STILL open
    expect(screen.getByRole("radiogroup", { name: "Icon" })).toBeInTheDocument();
  });

  it("AC-24: pressing Escape closes the popover", async () => {
    const user = userEvent.setup();
    render(<TestIconPickerWrapper />);

    await user.click(screen.getByRole("button", { name: "Change icon" }));
    expect(screen.getByRole("radiogroup", { name: "Icon" })).toBeInTheDocument();

    // Press Escape
    act(() => {
      fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Icon" }), {
        key: "Escape",
      });
    });

    expect(screen.queryByRole("radiogroup", { name: "Icon" })).not.toBeInTheDocument();
  });
});
