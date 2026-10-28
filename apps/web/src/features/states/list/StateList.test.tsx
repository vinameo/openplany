import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import type { StateResponse } from "@repo/contracts";
import { StateList } from "./StateList";

const sampleStates: StateResponse[] = [
  {
    id: "def-backlog",
    name: "Backlog",
    group: "backlog",
    color: "#8E98A8",
    level: "default",
    workItemCount: 0,
  },
  {
    id: "def-todo",
    name: "Todo",
    group: "planned",
    color: "#5B6B82",
    level: "default",
    workItemCount: 1,
  },
  {
    id: "def-in-progress",
    name: "In Progress",
    group: "active",
    color: "#E08A1E",
    level: "default",
    workItemCount: 2,
  },
  {
    id: "ws-qa",
    name: "QA",
    group: "active",
    color: "#3E7BD6",
    level: "workspace",
    workItemCount: 3,
  },
  {
    id: "proj-review",
    name: "Review",
    group: "active",
    color: "#7A5CC7",
    level: "project",
    workItemCount: 4,
  },
  {
    id: "def-done",
    name: "Done",
    group: "finished",
    color: "#2F9E6E",
    level: "default",
    workItemCount: 5,
  },
  {
    id: "def-cancelled",
    name: "Cancelled",
    group: "cancelled",
    color: "#B05A5A",
    level: "default",
    workItemCount: 0,
  },
];

describe("StateList", () => {
  it("renders 5 fixed groups in order and maintains exact API order within groups (AC-04)", () => {
    render(
      <AppUiProvider>
        <StateList
          states={sampleStates}
          ownLevel="project"
          canManage={true}
          ownCount={1}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    // Group headings in STATE_GROUPS order
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Backlog",
      "Planned",
      "Active",
      "Finished",
      "Cancelled",
    ]);

    // Active group states in exact API order: In Progress (default), QA (workspace), Review (project)
    const activeSection = screen
      .getByRole("heading", { name: "Active" })
      .closest("section");
    expect(activeSection).toBeInTheDocument();

    const items = activeSection!.querySelectorAll('li[role="listitem"]');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("In Progress");
    expect(items[0]).toHaveTextContent("Default");

    expect(items[1]).toHaveTextContent("QA");
    expect(items[1]).toHaveTextContent("From workspace");

    expect(items[2]).toHaveTextContent("Review");
    expect(items[2]).not.toHaveTextContent("Default");
    expect(items[2]).not.toHaveTextContent("From workspace");
  });

  it("hides Add state button, menus, and workItemCount when user lacks management permission (AC-03)", () => {
    render(
      <AppUiProvider>
        <StateList
          states={sampleStates}
          ownLevel="project"
          canManage={false}
          ownCount={1}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    // No Add state buttons
    expect(
      screen.queryByRole("button", { name: /Add state/i }),
    ).not.toBeInTheDocument();

    // No action menu buttons [⋯]
    expect(screen.queryByTestId(/state-menu-/)).not.toBeInTheDocument();

    // No workItemCount texts
    expect(screen.queryByText(/work item/i)).not.toBeInTheDocument();
  });

  it("only provides action menu for own level states (AC-02, INV-14)", () => {
    render(
      <AppUiProvider>
        <StateList
          states={sampleStates}
          ownLevel="project"
          canManage={true}
          ownCount={1}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    // Default states do NOT have menu
    expect(
      screen.queryByTestId("state-menu-def-in-progress"),
    ).not.toBeInTheDocument();
    // Workspace state on project page does NOT have menu
    expect(screen.queryByTestId("state-menu-ws-qa")).not.toBeInTheDocument();
    // Project state (own level) DOES have menu
    expect(screen.getByTestId("state-menu-proj-review")).toBeInTheDocument();
  });

  it("disables Add state button when ownCount reaches ownMax with tooltip (AC-22)", () => {
    render(
      <AppUiProvider>
        <StateList
          states={sampleStates}
          ownLevel="project"
          canManage={true}
          ownCount={50}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    const addButtons = screen.getAllByRole("button", { name: /Add state/i });
    for (const btn of addButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it("opens inline create form and validates state name live", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <AppUiProvider>
        <StateList
          states={sampleStates}
          ownLevel="project"
          canManage={true}
          ownCount={1}
          ownMax={50}
          onCreate={onCreate}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    const addBtn = screen.getByTestId("add-state-btn-active");
    await user.click(addBtn);

    const nameInput = screen.getByTestId("state-name-input");
    const saveBtn = screen.getByTestId("state-form-save");

    expect(saveBtn).toBeDisabled();

    // Type valid name
    await user.type(nameInput, "Testing");
    expect(saveBtn).toBeEnabled();

    await user.click(saveBtn);
    expect(onCreate).toHaveBeenCalledWith({
      name: "Testing",
      group: "active",
      color: "#8E98A8",
    });
  });

  it("shows discard confirmation when canceling a modified form", async () => {
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <StateList
          states={sampleStates}
          ownLevel="project"
          canManage={true}
          ownCount={1}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    const addBtn = screen.getByTestId("add-state-btn-active");
    await user.click(addBtn);

    const nameInput = screen.getByTestId("state-name-input");
    await user.type(nameInput, "Dirty value");

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    // Discard footer appears
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });
});
