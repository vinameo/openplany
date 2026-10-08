import { fireEvent, render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { TimezoneSelect } from "./TimezoneSelect";

describe("TimezoneSelect", () => {
  it("filters by city name and utc offset, and handles current unknown zone", () => {
    const handleChange = vi.fn();

    render(
      <AppUiProvider>
        <TimezoneSelect value="Asia/Saigon" onChange={handleChange} />
      </AppUiProvider>,
    );

    const input = screen.getByRole("combobox", {
      name: "Workspace Timezone",
    });

    // Opening dropdown shows the current non-standard zone with (current)
    fireEvent.click(input);
    expect(
      screen.getByRole("option", {
        name: /Asia\/Saigon \(current\)/i,
        hidden: true,
      }),
    ).toBeInTheDocument();

    // Change input value to "ho chi minh"
    fireEvent.change(input, { target: { value: "ho chi minh" } });

    expect(
      screen.getByRole("option", {
        name: /\(UTC\+07:00\)\s+Asia\/Ho_Chi_Minh/i,
        hidden: true,
      }),
    ).toBeInTheDocument();

    // Change input value to "+07"
    fireEvent.change(input, { target: { value: "+07" } });

    expect(
      screen.getByRole("option", {
        name: /\(UTC\+07:00\)\s+Asia\/Ho_Chi_Minh/i,
        hidden: true,
      }),
    ).toBeInTheDocument();
  });
});

