import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import {
  ConfirmPermissionChangesModal,
  type PermissionDiffItem,
} from "./ConfirmPermissionChangesModal";
import { DEFAULT_PERMISSION_ITEMS } from "./test/rolesFixtures";

describe("ConfirmPermissionChangesModal", () => {
  const diff: PermissionDiffItem[] = [
    {
      role: { scope: "workspace", key: "member" },
      granted: ["workspace.settings.update"],
      revoked: ["workspace.settings.view"],
    },
  ];

  it("displays human-readable labels from permissions prop", () => {
    render(
      <AppUiProvider>
        <ConfirmPermissionChangesModal
          opened={true}
          onClose={vi.fn()}
          diff={diff}
          onConfirm={vi.fn()}
          isSaving={false}
          permissions={DEFAULT_PERMISSION_ITEMS}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText("+ Edit workspace settings")).toBeInTheDocument();
    expect(screen.getByText("− View workspace settings")).toBeInTheDocument();
  });

  it("falls back to permission key if label is not found", () => {
    render(
      <AppUiProvider>
        <ConfirmPermissionChangesModal
          opened={true}
          onClose={vi.fn()}
          diff={[
            {
              role: { scope: "workspace", key: "member" },
              granted: ["unknown.permission.custom"],
              revoked: [],
            },
          ]}
          onConfirm={vi.fn()}
          isSaving={false}
          permissions={[]}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText("+ unknown.permission.custom")).toBeInTheDocument();
  });

  it("calls onConfirm when Save button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AppUiProvider>
        <ConfirmPermissionChangesModal
          opened={true}
          onClose={vi.fn()}
          diff={diff}
          onConfirm={onConfirm}
          isSaving={false}
          permissions={DEFAULT_PERMISSION_ITEMS}
        />
      </AppUiProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

