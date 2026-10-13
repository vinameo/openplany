import { fireEvent, render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { TimezoneSelect } from "./TimezoneSelect";
import { timezoneOptionLabel } from "./timezoneOptions";

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

  it("handles custom label and description", () => {
    render(
      <AppUiProvider>
        <TimezoneSelect
          label="Project Timezone"
          description="Project timezone description"
          value="UTC"
          onChange={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("combobox", { name: "Project Timezone" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Project timezone description"),
    ).toBeInTheDocument();
  });

  it("supports followOption: places it first, does not create (current) label, and matches search", () => {
    const handleChange = vi.fn();
    const followOption = {
      value: "workspace",
      label: "Workspace timezone · (UTC+07:00) Asia/Ho_Chi_Minh",
    };

    render(
      <AppUiProvider>
        <TimezoneSelect
          label="Project Timezone"
          value="workspace"
          onChange={handleChange}
          followOption={followOption}
        />
      </AppUiProvider>,
    );

    const input = screen.getByRole("combobox", {
      name: "Project Timezone",
    });

    fireEvent.click(input);

    // followOption should exist and NOT have (current)
    const options = screen.getAllByRole("option", { hidden: true });
    expect(options[0]?.textContent).toContain(
      "Workspace timezone · (UTC+07:00) Asia/Ho_Chi_Minh",
    );
    expect(options[0]?.textContent).not.toContain("(current)");

    // Searching "workspace" should match followOption
    fireEvent.change(input, { target: { value: "workspace" } });
    expect(
      screen.getByRole("option", {
        name: /Workspace timezone · \(UTC\+07:00\) Asia\/Ho_Chi_Minh/i,
        hidden: true,
      }),
    ).toBeInTheDocument();
  });
});

describe("timezoneOptionLabel", () => {
  it("formats IANA timezone to (UTC+offset) Zone string", () => {
    const label = timezoneOptionLabel("UTC");
    expect(label).toContain("UTC+00:00");
    expect(label).toContain("UTC");
  });
});
