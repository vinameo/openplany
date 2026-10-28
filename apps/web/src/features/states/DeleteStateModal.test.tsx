import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import type { StateResponse } from "@repo/contracts";
import { ApiRequestError } from "../../lib/apiClient";
import { DeleteStateModal } from "./DeleteStateModal";

const defaultBacklog: StateResponse = {
  id: "state-def-backlog",
  name: "Backlog",
  group: "backlog",
  color: "#8E98A8",
  level: "default",
};

const defaultTodo: StateResponse = {
  id: "state-def-todo",
  name: "Todo",
  group: "planned",
  color: "#5B6B82",
  level: "default",
};

const defaultActive: StateResponse = {
  id: "state-def-active",
  name: "In Progress",
  group: "active",
  color: "#2F9E6E",
  level: "default",
};

const workspaceActive: StateResponse = {
  id: "state-ws-active",
  name: "QA",
  group: "active",
  color: "#3E7BD6",
  level: "workspace",
};

const projectActive: StateResponse = {
  id: "state-prj-review",
  name: "Review",
  group: "active",
  color: "#7A5CC7",
  level: "project",
  workItemCount: 3,
};

const projectZero: StateResponse = {
  id: "state-prj-zero",
  name: "Empty State",
  group: "active",
  color: "#7A5CC7",
  level: "project",
  workItemCount: 0,
};

const allStates: StateResponse[] = [
  defaultBacklog,
  defaultTodo,
  defaultActive,
  workspaceActive,
  projectActive,
  projectZero,
];

describe("DeleteStateModal", () => {
  it("renders simple confirmation when workItemCount is 0", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue(undefined);

    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={projectZero}
          availableStates={allStates}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onRefetch={onRefetch}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText('Delete "Empty State"?')).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("delete-state-replacement-select"),
    ).not.toBeInTheDocument();

    const cancelBtn = screen.getByTestId("delete-state-cancel-button");
    await waitFor(() => {
      expect(cancelBtn).toHaveFocus();
    });

    const confirmBtn = screen.getByTestId("delete-state-confirm-button");
    await user.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith(projectZero.id, undefined);
  });

  it("renders replacement Select when workItemCount > 0 and defaults to default state of same group", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue(undefined);

    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={projectActive}
          availableStates={allStates}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onRefetch={onRefetch}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText('Delete "Review"?')).toBeInTheDocument();
    expect(
      screen.getByText("3 work items are in this state. Move them to:"),
    ).toBeInTheDocument();

    // Select should be rendered and have "In Progress" (default state of active group) selected
    const select = screen.getByTestId("delete-state-replacement-select");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("In Progress");

    const confirmBtn = screen.getByTestId("delete-state-confirm-button");
    await user.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith(projectActive.id, defaultActive.id);
  });

  it("handles singular workItemCount text correctly", () => {
    const singleItemState: StateResponse = {
      ...projectActive,
      workItemCount: 1,
    };

    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={singleItemState}
          availableStates={allStates}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          onRefetch={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByText("1 work item is in this state. Move it to:"),
    ).toBeInTheDocument();
  });

  it("handles 409 STATE_REPLACEMENT_REQUIRED: refetches, switches to select mode, shows alert", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiRequestError(409, {
        code: "STATE_REPLACEMENT_REQUIRED",
        message:
          "Work items were added to this state. Choose a state to move them to.",
      }),
    );
    const onCancel = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue(undefined);

    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={projectZero}
          availableStates={allStates}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onRefetch={onRefetch}
        />
      </AppUiProvider>,
    );

    // Click confirm in 0-count mode
    const confirmBtn = screen.getByTestId("delete-state-confirm-button");
    await user.click(confirmBtn);

    // After 409, refetch should be called
    expect(onRefetch).toHaveBeenCalledTimes(1);

    // Select mode should now be active
    expect(
      screen.getByTestId("delete-state-replacement-select"),
    ).toBeInTheDocument();

    // Alert should be displayed
    expect(
      screen.getByText(
        "Work items were added to this state. Choose a state to move them to.",
      ),
    ).toBeInTheDocument();
  });

  it("handles 409 STATE_REPLACEMENT_INVALID: refetches, resets selection, shows alert, disables confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiRequestError(409, {
        code: "STATE_REPLACEMENT_INVALID",
        message: "The state you chose is no longer available. Choose another.",
      }),
    );
    const onCancel = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue(undefined);

    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={projectActive}
          availableStates={allStates}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onRefetch={onRefetch}
        />
      </AppUiProvider>,
    );

    const confirmBtn = screen.getByTestId("delete-state-confirm-button");
    await user.click(confirmBtn);

    expect(onRefetch).toHaveBeenCalledTimes(1);

    // Selection should be cleared
    const select = screen.getByTestId("delete-state-replacement-select");
    expect(select).toHaveValue("");

    // Alert should be displayed
    expect(
      screen.getByText(
        "The state you chose is no longer available. Choose another.",
      ),
    ).toBeInTheDocument();

    // Confirm button should now be disabled since no replacement is selected
    expect(confirmBtn).toBeDisabled();
  });

  it("handles 404 STATE_NOT_FOUND: closes modal, refetches, calls onNotFound", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiRequestError(404, {
        code: "STATE_NOT_FOUND",
        message: "This state no longer exists.",
      }),
    );
    const onCancel = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    const onNotFound = vi.fn();

    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={projectZero}
          availableStates={allStates}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onRefetch={onRefetch}
          onNotFound={onNotFound}
        />
      </AppUiProvider>,
    );

    const confirmBtn = screen.getByTestId("delete-state-confirm-button");
    await user.click(confirmBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith("This state no longer exists.");
  });

  it("disables buttons while isPending is true", () => {
    render(
      <AppUiProvider>
        <DeleteStateModal
          opened={true}
          targetState={projectActive}
          availableStates={allStates}
          isPending={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          onRefetch={vi.fn()}
        />
      </AppUiProvider>,
    );

    const cancelBtn = screen.getByTestId("delete-state-cancel-button");
    const confirmBtn = screen.getByTestId("delete-state-confirm-button");
    const select = screen.getByTestId("delete-state-replacement-select");

    expect(cancelBtn).toBeDisabled();
    expect(confirmBtn).toBeDisabled();
    expect(select).toBeDisabled();
  });
});
