import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { ChangeStateGroupModal } from "./ChangeStateGroupModal";

describe("ChangeStateGroupModal", () => {
  it("renders state name, work item count, and target group", async () => {
    render(
      <AppUiProvider>
        <ChangeStateGroupModal
          opened={true}
          stateName="QA"
          targetGroup="finished"
          count={12}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText('Change group of "QA"?')).toBeInTheDocument();
    expect(
      screen.getByText("12 work items in this state will count as Finished."),
    ).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => {
      expect(cancelBtn).toHaveFocus();
    });
  });

  it("handles singular work item count correctly", () => {
    render(
      <AppUiProvider>
        <ChangeStateGroupModal
          opened={true}
          stateName="Review"
          targetGroup="active"
          count={1}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByText("1 work item in this state will count as Active."),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when Change group button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AppUiProvider>
        <ChangeStateGroupModal
          opened={true}
          stateName="QA"
          targetGroup="finished"
          count={5}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      </AppUiProvider>,
    );

    const confirmBtn = screen.getByRole("button", { name: "Change group" });
    await user.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AppUiProvider>
        <ChangeStateGroupModal
          opened={true}
          stateName="QA"
          targetGroup="finished"
          count={5}
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      </AppUiProvider>,
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
