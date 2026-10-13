import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { RoleChangeConfirmModal } from "./RoleChangeConfirmModal";

describe("RoleChangeConfirmModal", () => {
  it("renders modal content and triggers onConfirm and onCancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <AppUiProvider>
        <RoleChangeConfirmModal
          opened={true}
          title="Change role"
          confirmLabel="Change to Member"
          danger={false}
          pending={false}
          error={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
        >
          <p>Impact description</p>
        </RoleChangeConfirmModal>
      </AppUiProvider>,
    );

    expect(screen.getByText("Change role")).toBeInTheDocument();
    expect(screen.getByText("Impact description")).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toHaveAttribute("data-autofocus");

    await user.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const confirmButton = screen.getByRole("button", {
      name: "Change to Member",
    });
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders error alert when error is provided", () => {
    render(
      <AppUiProvider>
        <RoleChangeConfirmModal
          opened={true}
          title="Change role"
          confirmLabel="Change to Member"
          danger={false}
          pending={false}
          error="Failed to change role"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        >
          <p>Body</p>
        </RoleChangeConfirmModal>
      </AppUiProvider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Failed to change role");
  });

  it("disables cancel and shows loading state on confirm button when pending", () => {
    render(
      <AppUiProvider>
        <RoleChangeConfirmModal
          opened={true}
          title="Change role"
          confirmLabel="Change to Member"
          danger={true}
          pending={true}
          error={null}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        >
          <p>Body</p>
        </RoleChangeConfirmModal>
      </AppUiProvider>,
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeDisabled();

    const confirmButton = screen.getByRole("button", {
      name: "Change to Member",
    });
    expect(confirmButton).toHaveAttribute("data-loading", "true");
  });
});
