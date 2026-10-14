import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { RoleSelectCell } from "./RoleSelectCell";

describe("RoleSelectCell", () => {
  const defaultLabels = {
    admin: "Admin",
    member: "Member",
    guest: "Guest",
  };

  it("renders with accessible name based on memberName", () => {
    render(
      <AppUiProvider>
        <RoleSelectCell
          value="member"
          options={["admin", "member", "guest"]}
          labels={defaultLabels}
          memberName="Alice"
          onRequestChange={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("combobox", { name: "Role for Alice" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Member")).toBeInTheDocument();
  });

  it("calls onRequestChange when a different option is selected", async () => {
    const user = userEvent.setup();
    const onRequestChange = vi.fn();

    render(
      <AppUiProvider>
        <RoleSelectCell
          value="member"
          options={["admin", "member", "guest"]}
          labels={defaultLabels}
          memberName="Alice"
          onRequestChange={onRequestChange}
        />
      </AppUiProvider>,
    );

    const input = screen.getByRole("combobox", { name: "Role for Alice" });
    await user.click(input);

    const adminOption = await screen.findByRole("option", { name: /Admin/i });
    await user.click(adminOption);

    expect(onRequestChange).toHaveBeenCalledWith("admin");
  });

  it("does not call onRequestChange when the current value is selected", async () => {
    const user = userEvent.setup();
    const onRequestChange = vi.fn();

    render(
      <AppUiProvider>
        <RoleSelectCell
          value="member"
          options={["admin", "member", "guest"]}
          labels={defaultLabels}
          memberName="Alice"
          onRequestChange={onRequestChange}
        />
      </AppUiProvider>,
    );

    const input = screen.getByRole("combobox", { name: "Role for Alice" });
    await user.click(input);

    const memberOption = await screen.findByRole("option", {
      name: /^Member$/i,
    });
    await user.click(memberOption);

    expect(onRequestChange).not.toHaveBeenCalled();
  });

  it("prepends value as disabled option if value is not in options", async () => {
    const user = userEvent.setup();
    const onRequestChange = vi.fn();

    render(
      <AppUiProvider>
        <RoleSelectCell
          value="admin"
          options={["member", "guest"]}
          labels={defaultLabels}
          memberName="Alice"
          onRequestChange={onRequestChange}
        />
      </AppUiProvider>,
    );

    expect(screen.getByDisplayValue("Admin")).toBeInTheDocument();

    const input = screen.getByRole("combobox", { name: "Role for Alice" });
    await user.click(input);

    const adminOption = await screen.findByRole("option", { name: /Admin/i });
    expect(adminOption).toHaveAttribute("data-combobox-disabled", "true");
  });

  it("renders descriptions when provided", async () => {
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <RoleSelectCell
          value="member"
          options={["admin", "member"]}
          labels={defaultLabels}
          descriptionKeys={{
            admin: "common:roles.workspace.summary.admin",
            member: "common:roles.workspace.summary.member",
          }}
          memberName="Alice"
          onRequestChange={vi.fn()}
        />
      </AppUiProvider>,
    );

    const input = screen.getByRole("combobox", { name: "Role for Alice" });
    await user.click(input);

    expect(
      await screen.findByText(
        "Everything: settings, members, projects and deleting the workspace; access to every project",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Work in the projects they join; join public projects"),
    ).toBeInTheDocument();
  });

  it("renders description helper text below the input", () => {
    render(
      <AppUiProvider>
        <RoleSelectCell
          value="member"
          options={["admin", "member"]}
          labels={defaultLabels}
          description="Limited to assigned projects"
          memberName="Alice"
          onRequestChange={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByText("Limited to assigned projects"),
    ).toBeInTheDocument();
  });
});
