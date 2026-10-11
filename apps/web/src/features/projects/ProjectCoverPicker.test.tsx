import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ProjectCoverKey } from "@repo/contracts";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { ProjectCoverPicker } from "./ProjectCoverPicker";

function TestCoverPickerWrapper({
  initialValue = "cover-01",
  onChange = vi.fn(),
}: {
  initialValue?: ProjectCoverKey;
  onChange?: (val: ProjectCoverKey) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <AppUiProvider>
      <ProjectCoverPicker
        value={value}
        onChange={(val) => {
          setValue(val);
          onChange(val);
        }}
      >
        {({ onClick }) => (
          <button type="button" onClick={onClick}>
            Change cover
          </button>
        )}
      </ProjectCoverPicker>
    </AppUiProvider>
  );
}

describe("ProjectCoverPicker", () => {
  it("renders trigger and opens popover on click with 8 thumbnail options", async () => {
    const user = userEvent.setup();
    render(<TestCoverPickerWrapper />);

    const trigger = screen.getByRole("button", { name: "Change cover" });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    const radiogroup = screen.getByRole("radiogroup", { name: "Cover" });
    expect(radiogroup).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(8);

    // Initial selected is Cover 1
    expect(screen.getByRole("radio", { name: "Cover 1" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Cover 2" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("selects a different cover, notifies onChange, and closes the popover", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<TestCoverPickerWrapper onChange={handleChange} />);

    await user.click(screen.getByRole("button", { name: "Change cover" }));

    const cover3 = screen.getByRole("radio", { name: "Cover 3" });
    await user.click(cover3);

    expect(handleChange).toHaveBeenCalledWith("cover-03");
    // Popover is closed
    expect(screen.queryByRole("radiogroup", { name: "Cover" })).not.toBeInTheDocument();
  });

  it("supports keyboard navigation with arrow keys and Enter selection", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<TestCoverPickerWrapper onChange={handleChange} />);

    await user.click(screen.getByRole("button", { name: "Change cover" }));

    const cover1 = screen.getByRole("radio", { name: "Cover 1" });
    cover1.focus();

    // ArrowRight to Cover 2
    fireEvent.keyDown(cover1, { key: "ArrowRight" });
    const cover2 = screen.getByRole("radio", { name: "Cover 2" });
    expect(cover2).toHaveFocus();

    // Select with Enter
    fireEvent.keyDown(cover2, { key: "Enter" });
    expect(handleChange).toHaveBeenCalledWith("cover-02");
    expect(screen.queryByRole("radiogroup", { name: "Cover" })).not.toBeInTheDocument();
  });

  it("closes on Escape and stops event propagation", async () => {
    const user = userEvent.setup();
    render(<TestCoverPickerWrapper />);

    await user.click(screen.getByRole("button", { name: "Change cover" }));
    const dropdown = screen.getByRole("radiogroup", { name: "Cover" });
    expect(dropdown).toBeInTheDocument();

    const cover1 = screen.getByRole("radio", { name: "Cover 1" });
    fireEvent.keyDown(cover1, { key: "Escape" });

    expect(screen.queryByRole("radiogroup", { name: "Cover" })).not.toBeInTheDocument();
  });
});
