import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { stubMatchMedia } from "../../../test/mediaQuery";
import {
  PropertyPicker,
  type PropertyOption,
  type PropertyPickerProps,
} from "./PropertyPicker";

const mockOptions: PropertyOption[] = [
  { id: "opt-1", label: "Option 1", group: "g1" },
  { id: "opt-2", label: "Option 2", group: "g1" },
  { id: "opt-3", label: "Tiến độ", group: "g2" },
];

describe("PropertyPicker", () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });

  function renderPicker(overrides: Partial<PropertyPickerProps> = {}) {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props: PropertyPickerProps = {
      ariaLabel: "Test Property",
      triggerLabel: "Select Property",
      status: "ready",
      options: mockOptions,
      value: "opt-1",
      onChange,
      searchPlaceholder: "Search properties...",
      emptyLabel: "No properties found",
      testIdPrefix: "test",
      ...overrides,
    };

    const res = render(
      <AppUiProvider>
        <PropertyPicker {...props} />
      </AppUiProvider>,
    );

    return { user, onChange, ...res };
  }

  it("renders trigger button with triggerLabel and aria-label", () => {
    renderPicker({ triggerLabel: "Active Option" });
    const button = screen.getByTestId("test-picker-button");
    expect(button).toHaveTextContent("Active Option");
    expect(button).toHaveAttribute("aria-label", "Test Property");
  });

  it("opens dropdown and selects an option", async () => {
    const { user, onChange } = renderPicker();
    const button = screen.getByTestId("test-picker-button");

    await user.click(button);
    expect(screen.getByTestId("test-picker-dropdown")).toBeInTheDocument();

    const opt2 = screen.getByTestId("test-option-opt-2");
    await user.click(opt2);

    expect(onChange).toHaveBeenCalledWith("opt-2");
    expect(screen.getByTestId("test-picker-dropdown")).not.toBeVisible();
  });

  it("filters options using NFC normalization and shows empty label when no match", async () => {
    const { user } = renderPicker();
    await user.click(screen.getByTestId("test-picker-button"));

    const searchInput = screen.getByTestId("test-picker-search");
    // Type with decomposed NFD characters
    await user.type(searchInput, "tiến".normalize("NFD"));

    expect(screen.getByTestId("test-option-opt-3")).toBeInTheDocument();
    expect(screen.queryByTestId("test-option-opt-1")).toBeNull();

    // No match
    await user.clear(searchInput);
    await user.type(searchInput, "xyz");
    expect(screen.getByText("No properties found")).toBeInTheDocument();
  });

  it("renders grouped options when groupLabels are provided", async () => {
    const { user } = renderPicker({
      groupLabels: { g1: "Group One", g2: "Group Two" },
    });

    await user.click(screen.getByTestId("test-picker-button"));

    expect(screen.getByText("Group One")).toBeInTheDocument();
    expect(screen.getByText("Group Two")).toBeInTheDocument();
    expect(screen.getByTestId("test-option-opt-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-option-opt-3")).toBeInTheDocument();
  });

  it("closes dropdown on Escape without bubbling event", async () => {
    const onModalKeyDown = vi.fn();
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <div onKeyDown={onModalKeyDown}>
          <PropertyPicker
            ariaLabel="Test"
            triggerLabel="Test"
            status="ready"
            options={mockOptions}
            value={null}
            onChange={vi.fn()}
            searchPlaceholder="Search"
            emptyLabel="Empty"
            testIdPrefix="test"
          />
        </div>
      </AppUiProvider>,
    );

    const button = screen.getByTestId("test-picker-button");
    await user.click(button);
    expect(screen.getByTestId("test-picker-dropdown")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("test-picker-dropdown")).not.toBeVisible();
    expect(onModalKeyDown).not.toHaveBeenCalled();
  });

  describe("locked states (loading, error, no_permission)", () => {
    it("renders loading chip with aria-disabled='true' and tabIndex=0", async () => {
      const { user } = renderPicker({
        status: "loading",
        triggerLabel: "Loading...",
      });
      const chip = screen.getByTestId("test-picker-loading");

      expect(chip).toHaveAttribute("aria-disabled", "true");
      expect(chip).toHaveAttribute("tabindex", "0");
      expect(chip).toHaveTextContent("Loading...");

      // Tab focuses chip
      await user.tab();
      expect(chip).toHaveFocus();

      // Enter / Space / Click do not open dropdown
      await user.keyboard("{Enter}");
      expect(
        screen.queryByTestId("test-picker-dropdown"),
      ).not.toBeInTheDocument();
      await user.keyboard(" ");
      expect(
        screen.queryByTestId("test-picker-dropdown"),
      ).not.toBeInTheDocument();
      await user.click(chip);
      expect(
        screen.queryByTestId("test-picker-dropdown"),
      ).not.toBeInTheDocument();
    });

    it("renders no_permission chip with tooltip on hover and focus", async () => {
      const { user } = renderPicker({
        status: "no_permission",
        triggerLabel: "Fallback",
        lockedTooltip: "No permission to view",
      });
      const chip = screen.getByTestId("test-picker-no-permission");

      expect(chip).toHaveAttribute("aria-disabled", "true");

      // Hover displays tooltip
      await user.hover(chip);
      expect(
        await screen.findByText("No permission to view"),
      ).toBeInTheDocument();

      // Focus via Tab displays tooltip
      await user.unhover(chip);
      await user.tab();
      expect(chip).toHaveFocus();
      expect(
        await screen.findByText("No permission to view"),
      ).toBeInTheDocument();
    });

    it("renders error chip with load-failed testid and tooltip", async () => {
      const { user } = renderPicker({
        status: "error",
        triggerLabel: "Error fallback",
        lockedTooltip: "Failed to load options",
      });
      const chip = screen.getByTestId("test-picker-load-failed");

      expect(chip).toHaveAttribute("aria-disabled", "true");

      await user.hover(chip);
      expect(
        await screen.findByText("Failed to load options"),
      ).toBeInTheDocument();
    });
  });
});
